/**
 * OpenAPI language providers for the Monaco editor: curated completion
 * gap-fillers, hover, quick fixes, and cross-file go-to-definition. Providers
 * are global (per language, not per editor) — registered once per app run and
 * never disposed; component remounts reuse them.
 */
import { monaco } from './monacoSetup';
import type { OpenApiFormat } from '@nouto/core/services/openapi/types';
import { buildPointerMap } from '@nouto/core/services/openapi/pointerMap';
import { settings } from '@nouto/ui/stores/settings.svelte';
import { getSession, type OpenApiSessionState } from '../../lib/openapi/session.svelte';
import { detectJsonContext, detectYamlContext } from '../../lib/openapi/completion/context';
import { buildKeySuggestions, buildValueSuggestions } from '../../lib/openapi/completion/items';
import type { KeySuggestion, ValueSuggestion } from '../../lib/openapi/completion/items';
import { resolveHoverDocs } from '../../lib/openapi/hoverDocs';
import { buildQuickFixes } from '../../lib/openapi/quickFixes';
import { buildExternalQuickFixes } from '../../lib/openapi/externalQuickFixes';
import {
  crossFileRefTargets,
  parsePartialRefValue,
  typedRefValue,
} from '../../lib/openapi/completion/externalRefCompletion';
import { getExternalAnalysis } from '../../lib/openapi/externalAnalysisCache';
import { tauriFileResolver } from '../../lib/openapi/tauriFileResolver';
import { pathToFileUri, normalizeFileUri } from '../../lib/openapi/pathUtils';
import { resolveRefDefinition } from '../../lib/openapi/definition';
import { openReferencedFileAndReveal } from '../../lib/openapi/crossFileNav';
import { relativeLabel } from '@nouto/core/services/openapi/outline';
import { enumerateRefTargets } from '@nouto/core/services/openapi/completion/refTargets';

/** Post-edit cursor target: select a pointer's value (placeholder overwrite)
 * or its key anchor (inline rename). */
export interface RevealAndSelect {
  pointer: string;
  selectValue: boolean;
}

/**
 * Model URIs are file:///nouto/openapi/<sessionId>.<ext> — opaque session
 * ids, deliberately NOT real file paths: with real-file URIs Monaco's native
 * go-to-definition would setModel an already-open target itself, bypassing
 * the session registry and desyncing the tab strip. The synthetic namespace
 * forces all cross-file navigation through our editor opener.
 */
export function sessionIdFromModel(model: monaco.editor.ITextModel): string | undefined {
  return /^\/nouto\/openapi\/(.+)\.(?:yaml|json)$/.exec(model.uri.path)?.[1];
}

/** Resolves the session a model belongs to (providers run for any open tab's model). */
function sessionForModel(model: monaco.editor.ITextModel): OpenApiSessionState | undefined {
  const id = sessionIdFromModel(model);
  return id ? getSession(id) : undefined;
}

function modelFormat(model: monaco.editor.ITextModel): OpenApiFormat {
  return model.getLanguageId() === 'json' ? 'json' : 'yaml';
}

export function offsetsToRange(
  model: monaco.editor.ITextModel,
  from: number,
  to: number,
): monaco.Range {
  const start = model.getPositionAt(from);
  const end = model.getPositionAt(to);
  return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

/** IMarkerData.code may be a string or {value, target}; ours is a string. */
function markerCode(marker: monaco.editor.IMarkerData): string | undefined {
  return typeof marker.code === 'string' ? marker.code : marker.code?.value;
}

function keySuggestionKind(kind: KeySuggestion['kind']): monaco.languages.CompletionItemKind {
  switch (kind) {
    case 'object':
      return monaco.languages.CompletionItemKind.Module;
    case 'array':
      return monaco.languages.CompletionItemKind.Field;
    case 'enum':
      return monaco.languages.CompletionItemKind.EnumMember;
    case 'dynamic-key':
      return monaco.languages.CompletionItemKind.Value;
    default:
      return monaco.languages.CompletionItemKind.Property;
  }
}

/**
 * Cross-file `$ref` suggestions (Phase 5). With a local file part typed
 * (`./common.yaml#/…`), suggests that file's ref targets; with no `#` yet,
 * suggests whole refs into files the document already references (from the
 * cached external analysis — no extra I/O). Failures degrade silently to
 * the in-document items.
 */
async function appendCrossFileSuggestions(
  out: monaco.languages.CompletionItem[],
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  session: OpenApiSessionState,
  parentKind: Parameters<typeof enumerateRefTargets>[1],
  inQuotes: boolean,
  isYaml: boolean,
): Promise<void> {
  if (!settings.openApiExternalRefsEnabled || !session.documentUri) return;
  const before = model.getValueInRange(
    new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column),
  );
  const typed = typedRefValue(before);
  if (!typed) return;
  // typedRefValue speaks 0-based characters; Monaco columns are 1-based.
  const replaceRange = new monaco.Range(
    position.lineNumber,
    typed.startCharacter + 1,
    position.lineNumber,
    position.column,
  );
  const item = (ref: string): monaco.languages.CompletionItem => ({
    label: ref,
    kind: monaco.languages.CompletionItemKind.Reference,
    // A leading '#' starts a comment in unquoted YAML, so YAML refs must be
    // quoted; JSON values are quoted unless the cursor already sits in one.
    insertText: inQuotes ? ref : isYaml ? `'${ref}'` : `"${ref}"`,
    range: replaceRange,
    filterText: ref,
  });
  const fromUri = pathToFileUri(session.documentUri);

  try {
    if (typed.text.includes('#')) {
      const partial = parsePartialRefValue(typed.text);
      if (!partial) return;
      const pointers = await crossFileRefTargets(fromUri, partial, parentKind, tauriFileResolver);
      for (const pointer of pointers) out.push(item(`${partial.filePart}${pointer}`));
      return;
    }

    const external = await getExternalAnalysis(session, tauriFileResolver);
    for (const [uri, file] of external.resolvedFiles) {
      const rel = relativeLabel(fromUri, uri);
      const display = rel.startsWith('../') ? rel : `./${rel}`;
      for (const pointer of enumerateRefTargets(file.parsed, parentKind)) {
        out.push(item(`${display}${pointer}`));
      }
    }
  } catch {
    // Unresolvable/unreadable targets must never break in-document completion.
  }
}

const completionProvider: monaco.languages.CompletionItemProvider = {
  // '/' and '#' re-trigger while typing $ref pointers.
  triggerCharacters: [':', ' ', '"', "'", '-', '/', '#'],
  async provideCompletionItems(model, position) {
    const empty = { suggestions: [] as monaco.languages.CompletionItem[] };
    if (!settings.openApiIntelliSenseEnabled) return empty;
    const session = sessionForModel(model);
    const analysis = session?.analysis;
    if (!session || !analysis) return empty;

    const format = modelFormat(model);
    const full = format === 'json';
    const text = model.getValue();
    const offset = model.getOffsetAt(position);
    const map = buildPointerMap(text, format);
    const version = session.version ?? '3.1';
    const ctx =
      format === 'json'
        ? detectJsonContext(text, offset, map)
        : detectYamlContext(text, offset, map);
    if (ctx.mode === 'none') return empty;

    // CompletionItem.range is required in Monaco (no vscode-style default):
    // fall back to the current word, mirroring vscode's implicit behavior.
    const word = model.getWordUntilPosition(position);
    const defaultRange = new monaco.Range(
      position.lineNumber,
      word.startColumn,
      position.lineNumber,
      word.endColumn,
    );

    if (ctx.mode === 'value') {
      const values = buildValueSuggestions(ctx, version, analysis, { full });
      const suggestions = values.map((value: ValueSuggestion): monaco.languages.CompletionItem => ({
        label: value.label,
        kind:
          value.kind === 'ref'
            ? monaco.languages.CompletionItemKind.Reference
            : monaco.languages.CompletionItemKind.EnumMember,
        insertText: value.insertText,
        range: defaultRange,
        documentation: value.docs ? { value: value.docs } : undefined,
        filterText: value.label,
      }));
      if (ctx.propertyName === '$ref') {
        await appendCrossFileSuggestions(
          suggestions,
          model,
          position,
          session,
          ctx.parentKind,
          ctx.inQuotes,
          format === 'yaml',
        );
      }
      return { suggestions };
    }

    const range =
      ctx.wordStart !== undefined
        ? monaco.Range.fromPositions(model.getPositionAt(ctx.wordStart), position)
        : defaultRange;
    const keys = buildKeySuggestions(ctx, version, analysis, { full });
    return {
      suggestions: keys.map((key: KeySuggestion): monaco.languages.CompletionItem => ({
        label: key.name,
        kind: keySuggestionKind(key.kind),
        insertText: key.snippet,
        insertTextRules: key.isSnippet
          ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
          : undefined,
        range,
        documentation: key.docs ? { value: key.docs } : undefined,
        detail: key.detail,
      })),
    };
  },
};

const hoverProvider: monaco.languages.HoverProvider = {
  provideHover(model, position) {
    if (!settings.openApiIntelliSenseEnabled) return undefined;
    const session = sessionForModel(model);
    if (!session) return undefined;
    const format = modelFormat(model);
    const map = buildPointerMap(model.getValue(), format);
    const version = session.version ?? '3.1';
    const result = resolveHoverDocs(map, model.getOffsetAt(position), version);
    if (!result) return undefined;
    return {
      contents: [{ value: result.docs }],
      range: offsetsToRange(model, result.range.from, result.range.to),
    };
  },
};

const codeActionProvider: monaco.languages.CodeActionProvider = {
  provideCodeActions(model, range, context) {
    const empty = { actions: [] as monaco.languages.CodeAction[], dispose() {} };
    const session = sessionForModel(model);
    const analysis = session?.analysis;
    if (!session || !analysis) return empty;

    const format = modelFormat(model);
    const text = model.getValue();
    const map = buildPointerMap(text, format);
    const requested = {
      from: model.getOffsetAt(range.getStartPosition()),
      to: model.getOffsetAt(range.getEndPosition()),
    };
    const candidates = buildQuickFixes(
      { text, format },
      session.diagnostics,
      analysis,
      map,
      requested,
    );
    const actions = candidates.map((candidate): monaco.languages.CodeAction => ({
      title: candidate.title,
      kind: 'quickfix',
      diagnostics: context.markers.filter((marker) => markerCode(marker) === candidate.code),
      edit: {
        edits: candidate.edits.map((edit) => ({
          resource: model.uri,
          // Stale actions (user kept typing before clicking) are rejected
          // instead of mis-applied.
          versionId: model.getVersionId(),
          textEdit: {
            range: offsetsToRange(model, edit.offset, edit.offset + edit.length),
            text: edit.text,
          },
        })),
      },
    }));
    // Cross-file fixes (Phase 5): side-effecting apply() dispatched through
    // a command — they edit ANOTHER document or create a file, which a
    // CodeAction.edit on this model cannot express.
    if (settings.openApiExternalRefsEnabled) {
      externalFixRegistry.clear();
      for (const fix of buildExternalQuickFixes(session, session.diagnostics, map, requested)) {
        const fixId = `external-fix-${++externalFixSeq}`;
        externalFixRegistry.set(fixId, fix.apply);
        actions.push({
          title: fix.title,
          kind: 'quickfix',
          diagnostics: context.markers.filter((marker) => markerCode(marker) === fix.code),
          command: { id: EXTERNAL_FIX_COMMAND, title: fix.title, arguments: [fixId] },
        });
      }
    }
    return { actions, dispose() {} };
  },
};

/** apply() closures for the currently offered external fixes (rebuilt per lightbulb). */
const EXTERNAL_FIX_COMMAND = 'nouto.openapi.applyExternalQuickFix';
const externalFixRegistry = new Map<string, () => Promise<void>>();
let externalFixSeq = 0;

/**
 * External definitions in flight (Phase 5): the definition provider returns
 * a placeholder Location whose URI has no model, Monaco hands that resource
 * to the editor opener, and the target pointer travels through this map
 * (the opener API has no pointer parameter; last-write-wins is fine — one
 * navigation happens at a time). Keys are normalizeFileUri'd because Monaco
 * Uri round-trips re-encode drive colons.
 */
const pendingExternalDefinitions = new Map<string, string>();

function externalDefinitionKey(uriText: string): string {
  try {
    return normalizeFileUri(uriText);
  } catch {
    return uriText;
  }
}

const definitionProvider: monaco.languages.DefinitionProvider = {
  provideDefinition(model, position) {
    const session = sessionForModel(model);
    if (!session?.analysis) return undefined;
    const format = modelFormat(model);
    const map = buildPointerMap(model.getValue(), format);
    const fromUri = session.documentUri ? pathToFileUri(session.documentUri) : undefined;
    const def = resolveRefDefinition(
      map,
      session.analysis,
      model.getOffsetAt(position),
      fromUri,
      tauriFileResolver,
    );
    if (!def) return undefined;
    if (def.kind === 'internal') {
      return { uri: model.uri, range: offsetsToRange(model, def.range.from, def.range.to) };
    }
    if (!settings.openApiExternalRefsEnabled) return undefined;
    pendingExternalDefinitions.set(externalDefinitionKey(def.targetFileUri), def.targetPointer);
    // Placeholder range: no model exists for the target URI (model URIs are
    // synthetic session ids by design), so Monaco routes to the opener,
    // which does the real open + pointer reveal.
    return { uri: monaco.Uri.parse(def.targetFileUri), range: new monaco.Range(1, 1, 1, 1) };
  },
};

// Language providers are global (per language, not per editor) — register
// once per app run and never dispose; remounts reuse them, same lifetime
// contract as the monaco-yaml handle. Pushing these into a mount's
// disposables would silently kill IntelliSense on the second document open.
let providersRegistered = false;

export function registerOpenApiProviders(): void {
  if (providersRegistered) return;
  providersRegistered = true;
  for (const language of ['yaml', 'json'] as const) {
    monaco.languages.registerHoverProvider(language, hoverProvider);
    monaco.languages.registerCompletionItemProvider(language, completionProvider);
    monaco.languages.registerCodeActionProvider(language, codeActionProvider, {
      providedCodeActionKinds: ['quickfix'],
    });
    monaco.languages.registerDefinitionProvider(language, definitionProvider);
  }
  monaco.editor.registerCommand(EXTERNAL_FIX_COMMAND, (_accessor: unknown, fixId: string) => {
    const apply = externalFixRegistry.get(fixId);
    if (apply) void apply();
  });
  // Called by standalone Monaco when navigation targets a resource with no
  // live model (every external definition, by construction).
  monaco.editor.registerEditorOpener({
    openCodeEditor(_source, resource) {
      const key = externalDefinitionKey(resource.toString(true));
      const pointer = pendingExternalDefinitions.get(key);
      if (pointer === undefined) return false;
      pendingExternalDefinitions.delete(key);
      void openReferencedFileAndReveal(key, pointer);
      return true;
    },
  });
}
