import * as yaml from 'js-yaml';
import type { OpenApiDiagnostic, OpenApiFormat } from './types';
import { escapePointerSegment, getByPointer, parsePointer } from './pointer';
import { isRefNode } from './refs';

/**
 * Platform seam for loading external `$ref` targets. Core never performs I/O
 * itself: hosts (VS Code, desktop) supply a resolver and core stays pure.
 *
 * `resolve` is synchronous URI arithmetic — `resolveExternalRefUri` is the
 * canonical implementation and hosts normally delegate to it. Only `load` is
 * platform-specific.
 */
export interface FileResolver {
  resolve(fromUri: string, refPath: string): string;
  load(uri: string): Promise<{ content: string; format: OpenApiFormat } | undefined>;
}

/** A local external `$ref` split into its file path and fragment pointer. */
export interface SplitExternalRef {
  filePath: string;
  /** RFC 6901 pointer from the fragment; '' references the whole document. */
  pointer: string;
}

/**
 * Splits a `$ref` string into file path + pointer when it is a local relative
 * file reference. Returns undefined for internal refs (`#...`), scheme'd URLs
 * (`http://...`, and Windows drive paths like `C:\...`), and absolute paths —
 * those keep the sync pass's "unsupported" warning.
 */
export function splitExternalRef(ref: string): SplitExternalRef | undefined {
  if (ref === '' || ref.startsWith('#')) return undefined;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref)) return undefined;
  if (ref.startsWith('/') || ref.startsWith('\\')) return undefined;
  const hashIndex = ref.indexOf('#');
  const filePath = hashIndex === -1 ? ref : ref.slice(0, hashIndex);
  if (!filePath) return undefined;
  let pointer = '';
  if (hashIndex !== -1) {
    try {
      pointer = decodeURIComponent(ref.slice(hashIndex + 1));
    } catch {
      return undefined;
    }
  }
  return { filePath, pointer };
}

/**
 * Resolves a relative file path against a base document URI using WHATWG URL
 * semantics (`.`/`..` collapse, so equivalent spellings produce identical
 * cache keys). Falls back to the raw path when the base is not a valid URI.
 */
export function resolveExternalRefUri(fromUri: string, filePath: string): string {
  try {
    return new URL(filePath, fromUri).toString();
  } catch {
    return filePath;
  }
}

/** One external `$ref` occurrence in the root document. */
export interface ExternalRefEntry {
  /** The raw `$ref` string as written. */
  ref: string;
  /** Pointer of the `$ref` property in the root document (`.../$ref`). */
  atPointer: string;
  /** Resolved absolute file URI (no fragment). */
  targetUri: string;
  /** Pointer within the target file; '' for whole-document refs. */
  targetPointer: string;
}

export interface ResolvedExternalFile {
  parsed: unknown;
}

/** Successfully loaded+parsed external files, keyed by absolute file URI. */
export type ResolvedFileMap = Map<string, ResolvedExternalFile>;

export interface ExternalRefLimits {
  /** Maximum ref-following hops per chain. Default 10. */
  maxDepth?: number;
  /** Maximum distinct files loaded per analysis. Default 50. */
  maxFiles?: number;
}

export interface ExternalAnalysisResult {
  diagnostics: OpenApiDiagnostic[];
  /** Every external ref occurrence in the root doc, keyed by `atPointer`. */
  externalRefs: Map<string, ExternalRefEntry>;
  resolvedFiles: ResolvedFileMap;
  /** Every file URI attempted (success or failure) — feeds reverse indexes. */
  referencedFiles: Set<string>;
}

const DEFAULT_MAX_DEPTH = 10;
const DEFAULT_MAX_FILES = 50;

type LoadOutcome =
  | { ok: true; parsed: unknown }
  | { ok: false; reason: 'not-found' | 'parse-error' | 'limit' };

/**
 * Parses a loaded external file's content; undefined on parse failure. Shared
 * by the analysis walker and hosts that need to peek into a single file (e.g.
 * cross-file `$ref` completion).
 */
export function parseExternalFileContent(content: string, format: OpenApiFormat): unknown | undefined {
  try {
    const parsed = format === 'yaml' ? yaml.load(content) : JSON.parse(content);
    return parsed === undefined ? undefined : parsed;
  } catch {
    return undefined;
  }
}

/**
 * Follows every local external `$ref` in `parsedSpec` across workspace files,
 * transitively, and reports what the synchronous pass cannot: missing files
 * (`external-file-not-found`), missing pointers (`external-pointer-not-found`),
 * cross-file cycles, and depth/file-count limit breaches.
 *
 * All diagnostics anchor at the root document's `$ref` location — deeper file
 * positions are not visible to the host's problem reporting for this document.
 * Diagnostics are deduplicated per distinct raw `$ref` string, matching the
 * sync pass's `scanReferences` behavior.
 *
 * Refs inside an external file resolve relative to THAT file (its own document
 * for `#...`, its own URI for relative paths), never the root.
 */
export async function analyzeOpenApiWithExternalRefs(
  parsedSpec: object,
  rootUri: string,
  resolver: FileResolver,
  limits?: ExternalRefLimits
): Promise<ExternalAnalysisResult> {
  const maxDepth = limits?.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFiles = limits?.maxFiles ?? DEFAULT_MAX_FILES;

  const diagnostics: OpenApiDiagnostic[] = [];
  const externalRefs = new Map<string, ExternalRefEntry>();
  const resolvedFiles: ResolvedFileMap = new Map();
  const referencedFiles = new Set<string>();
  const loadOutcomes = new Map<string, LoadOutcome>();
  /** Chain targets fully validated once — skipped on re-encounter (diamonds). */
  const validated = new Set<string>();
  const emittedKeys = new Set<string>();
  let limitReported = false;

  const emit = (diagnostic: OpenApiDiagnostic): void => {
    const key = `${diagnostic.code ?? ''}|${diagnostic.message}|${diagnostic.pointer ?? ''}`;
    if (emittedKeys.has(key)) return;
    emittedKeys.add(key);
    diagnostics.push(diagnostic);
  };

  const load = async (uri: string): Promise<LoadOutcome> => {
    if (uri === rootUri) return { ok: true, parsed: parsedSpec };
    const cached = loadOutcomes.get(uri);
    if (cached) return cached;
    referencedFiles.add(uri);
    let outcome: LoadOutcome;
    if (loadOutcomes.size >= maxFiles) {
      outcome = { ok: false, reason: 'limit' };
    } else {
      const file = await resolver.load(uri);
      if (!file) {
        outcome = { ok: false, reason: 'not-found' };
      } else {
        const parsed = parseExternalFileContent(file.content, file.format);
        outcome =
          parsed === undefined ? { ok: false, reason: 'parse-error' } : { ok: true, parsed };
      }
    }
    loadOutcomes.set(uri, outcome);
    if (outcome.ok) resolvedFiles.set(uri, { parsed: outcome.parsed });
    return outcome;
  };

  const reportLoadFailure = (
    outcome: { ok: false; reason: 'not-found' | 'parse-error' | 'limit' },
    displayRef: string,
    rootAtPointer: string,
    rootRef: string,
    targetUri: string
  ): void => {
    if (outcome.reason === 'limit') {
      if (!limitReported) {
        limitReported = true;
        emit({
          source: 'reference',
          severity: 'warning',
          message: `External reference file limit (${maxFiles}) exceeded; further external references were not resolved.`,
          pointer: rootAtPointer,
        });
      }
      return;
    }
    emit({
      source: 'reference',
      severity: 'error',
      message:
        outcome.reason === 'not-found'
          ? `External file not found: "${displayRef}".`
          : `External file could not be parsed: "${displayRef}".`,
      pointer: rootAtPointer,
      code: 'external-file-not-found',
      data: { ref: rootRef, targetUri },
    });
  };

  /** Follows one file+pointer target, then walks its subtree for further refs. */
  const followTarget = async (
    fileUri: string,
    pointer: string,
    displayRef: string,
    rootAtPointer: string,
    rootRef: string,
    chain: Set<string>,
    depth: number
  ): Promise<void> => {
    const outcome = await load(fileUri);
    if (!outcome.ok) {
      reportLoadFailure(outcome, displayRef, rootAtPointer, rootRef, fileUri);
      return;
    }
    const target = pointer === '' ? { found: true, value: outcome.parsed } : getByPointer(outcome.parsed, pointer);
    if (!target.found) {
      emit({
        source: 'reference',
        severity: 'error',
        message: `Pointer "${pointer}" not found in external file "${displayRef}".`,
        pointer: rootAtPointer,
        code: 'external-pointer-not-found',
        data: { ref: rootRef, targetUri: fileUri, targetPointer: pointer },
      });
      return;
    }

    const key = `${fileUri}#${pointer}`;
    if (validated.has(key)) return;
    if (chain.has(key)) {
      emit({
        source: 'reference',
        severity: 'error',
        message: `Circular external reference detected: ${[...chain, key].join(' -> ')}`,
        pointer: rootAtPointer,
      });
      return;
    }
    chain.add(key);
    await walkValue(target.value, fileUri, rootAtPointer, rootRef, chain, depth);
    chain.delete(key);
    validated.add(key);
  };

  /** Walks a resolved subtree living in `fileUri`, following refs it contains. */
  const walkValue = async (
    value: unknown,
    fileUri: string,
    rootAtPointer: string,
    rootRef: string,
    chain: Set<string>,
    depth: number
  ): Promise<void> => {
    if (Array.isArray(value)) {
      for (const item of value) {
        await walkValue(item, fileUri, rootAtPointer, rootRef, chain, depth);
      }
      return;
    }
    if (value === null || typeof value !== 'object') return;

    if (isRefNode(value)) {
      const ref = value.$ref;
      if (depth >= maxDepth) {
        emit({
          source: 'reference',
          severity: 'error',
          message: `External reference chain exceeds maximum depth (${maxDepth}).`,
          pointer: rootAtPointer,
        });
        return;
      }
      if (ref.startsWith('#')) {
        await followTarget(fileUri, ref.slice(1), ref, rootAtPointer, rootRef, chain, depth + 1);
        return;
      }
      const split = splitExternalRef(ref);
      if (!split) {
        // Non-local ref inside an external file — the sync pass never sees it.
        emit({
          source: 'reference',
          severity: 'warning',
          message: `External reference "${ref}" (via "${rootRef}") is not supported. Only local file references are resolved.`,
          pointer: rootAtPointer,
          code: 'external-ref-unsupported',
        });
        return;
      }
      const targetUri = resolver.resolve(fileUri, split.filePath);
      await followTarget(targetUri, split.pointer, ref, rootAtPointer, rootRef, chain, depth + 1);
      return;
    }

    for (const item of Object.values(value)) {
      await walkValue(item, fileUri, rootAtPointer, rootRef, chain, depth);
    }
  };

  // Collect the root document's external refs (document order), mirroring
  // scanReferences' traversal: Reference Object siblings are not descended.
  const rootEntries: ExternalRefEntry[] = [];
  const collect = (node: unknown, pointer: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => collect(item, `${pointer}/${index}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    if (isRefNode(node)) {
      const ref = node.$ref;
      if (!ref.startsWith('#')) {
        const split = splitExternalRef(ref);
        if (split) {
          const entry: ExternalRefEntry = {
            ref,
            atPointer: `${pointer}/$ref`,
            targetUri: resolver.resolve(rootUri, split.filePath),
            targetPointer: split.pointer,
          };
          externalRefs.set(entry.atPointer, entry);
          rootEntries.push(entry);
        }
      }
      return;
    }
    for (const [key, item] of Object.entries(node)) {
      collect(item, `${pointer}/${escapePointerSegment(key)}`);
    }
  };
  collect(parsedSpec, '');

  const seenRefs = new Set<string>();
  for (const entry of rootEntries) {
    if (seenRefs.has(entry.ref)) continue;
    seenRefs.add(entry.ref);
    await followTarget(
      entry.targetUri,
      entry.targetPointer,
      entry.ref,
      entry.atPointer,
      entry.ref,
      new Set<string>(),
      1
    );
  }

  return { diagnostics, externalRefs, resolvedFiles, referencedFiles };
}

export interface BundleResult {
  document: object;
  /** Targets that could not be inlined; their `$ref`s are left untouched. */
  diagnostics: OpenApiDiagnostic[];
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => deepClone(item)) as unknown as T;
  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    const clone: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) clone[key] = deepClone(item);
    return clone as unknown as T;
  }
  return value;
}

const COMPONENT_KEY_INVALID = /[^a-zA-Z0-9._-]/g;

function baseNameFor(fileUri: string, pointer: string): string {
  if (pointer !== '') {
    const segments = parsePointer(pointer);
    const last = segments?.[segments.length - 1];
    if (last) {
      const sanitized = last.replace(COMPONENT_KEY_INVALID, '_');
      if (sanitized.replace(/_/g, '') !== '') return sanitized;
    }
  }
  const path = fileUri.split(/[/\\]/).pop() ?? '';
  const stem = path.replace(/\.[^.]*$/, '').replace(COMPONENT_KEY_INVALID, '_');
  return stem.replace(/_/g, '') === '' ? 'Schema' : stem;
}

/**
 * Produces a self-contained document by hoisting every external `$ref` target
 * (from `resolvedFiles`, as produced by `analyzeOpenApiWithExternalRefs`) into
 * `components.schemas` and rewriting refs to point at the hoisted copies.
 *
 * Pure and synchronous — no I/O. Each distinct `file#pointer` target is hoisted
 * once (name collisions get numeric suffixes); refs are rewritten BEFORE the
 * hoisted subtree is processed, so cross-file cycles become ordinary internal
 * cycles. Targets that are missing from `resolvedFiles` (or whose pointer does
 * not resolve) keep their original `$ref` and produce a diagnostic — a partial
 * bundle, never a throw.
 */
export function bundleExternalRefs(
  spec: object,
  rootUri: string,
  resolvedFiles: ResolvedFileMap
): BundleResult {
  const document = deepClone(spec) as Record<string, unknown>;
  const diagnostics: OpenApiDiagnostic[] = [];
  const assigned = new Map<string, string>();
  const usedNames = new Set<string>();
  let schemasBucket: Record<string, unknown> | undefined;

  const existingSchemas = (document.components as Record<string, unknown> | undefined)?.schemas;
  if (existingSchemas !== null && typeof existingSchemas === 'object' && !Array.isArray(existingSchemas)) {
    for (const key of Object.keys(existingSchemas)) usedNames.add(key);
  }

  const bucket = (): Record<string, unknown> => {
    if (!schemasBucket) {
      const components =
        document.components !== null &&
        typeof document.components === 'object' &&
        !Array.isArray(document.components)
          ? (document.components as Record<string, unknown>)
          : (document.components = {});
      const schemas =
        components.schemas !== null &&
        typeof components.schemas === 'object' &&
        !Array.isArray(components.schemas)
          ? (components.schemas as Record<string, unknown>)
          : (components.schemas = {});
      schemasBucket = schemas;
    }
    return schemasBucket;
  };

  const claimName = (base: string): string => {
    if (!usedNames.has(base)) {
      usedNames.add(base);
      return base;
    }
    let counter = 2;
    while (usedNames.has(`${base}_${counter}`)) counter += 1;
    const name = `${base}_${counter}`;
    usedNames.add(name);
    return name;
  };

  const docFor = (fileUri: string): unknown | undefined =>
    fileUri === rootUri ? spec : resolvedFiles.get(fileUri)?.parsed;

  const hoist = (fileUri: string, pointer: string, atPointer: string, displayRef: string): string | undefined => {
    const key = `${fileUri}#${pointer}`;
    const existing = assigned.get(key);
    if (existing) return existing;

    const doc = docFor(fileUri);
    if (doc === undefined) {
      diagnostics.push({
        source: 'reference',
        severity: 'warning',
        message: `Bundling skipped "${displayRef}": file was not resolved.`,
        pointer: atPointer,
        code: 'external-file-not-found',
        data: { targetUri: fileUri },
      });
      return undefined;
    }
    const target = pointer === '' ? { found: true, value: doc } : getByPointer(doc, pointer);
    if (!target.found) {
      diagnostics.push({
        source: 'reference',
        severity: 'warning',
        message: `Bundling skipped "${displayRef}": pointer "${pointer}" not found.`,
        pointer: atPointer,
        code: 'external-pointer-not-found',
        data: { targetUri: fileUri, targetPointer: pointer },
      });
      return undefined;
    }

    const name = claimName(baseNameFor(fileUri, pointer));
    assigned.set(key, name);
    const clone = deepClone(target.value);
    bucket()[name] = clone;
    process(clone, fileUri, `/components/schemas/${escapePointerSegment(name)}`);
    return name;
  };

  const process = (node: unknown, fileUri: string, pointer: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => process(item, fileUri, `${pointer}/${index}`));
      return;
    }
    if (node === null || typeof node !== 'object') return;

    if (isRefNode(node)) {
      const ref = node.$ref;
      const atPointer = `${pointer}/$ref`;
      if (ref.startsWith('#')) {
        // Root-relative internal refs are already valid; refs inside a hoisted
        // subtree point into their own file and must be hoisted too.
        if (fileUri === rootUri) return;
        const name = hoist(fileUri, ref.slice(1), atPointer, ref);
        if (name) (node as Record<string, unknown>).$ref = `#/components/schemas/${name}`;
        return;
      }
      const split = splitExternalRef(ref);
      if (!split) return; // scheme'd / absolute refs stay as-is (unsupported)
      const targetUri = resolveExternalRefUri(fileUri, split.filePath);
      const name = hoist(targetUri, split.pointer, atPointer, ref);
      if (name) (node as Record<string, unknown>).$ref = `#/components/schemas/${name}`;
      return;
    }

    for (const [key, item] of Object.entries(node)) {
      process(item, fileUri, `${pointer}/${escapePointerSegment(key)}`);
    }
  };

  process(document, rootUri, '');
  return { document, diagnostics };
}
