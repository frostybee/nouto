import type { OpenApiAnalysis, OpenApiDiagnostic } from './types';
import type { LintOptions } from './lint/types';
import { collectExampleSites, EXAMPLE_INVALID_MEDIA, EXAMPLE_INVALID_SCHEMA } from './lint/exampleSites';
import type { ExampleSite } from './lint/exampleSites';
import { ALL_LINT_RULES, effectiveSeverity } from './lint/registry';

/**
 * HOST-SIDE ONLY: validates document examples against their schemas with Ajv,
 * which generates code at runtime. Webview CSPs forbid eval, so this must
 * never be imported into a webview bundle; the desktop app has an equivalent
 * Rust command (`validate_openapi_examples`). VS Code calls this from the
 * diagnostics manager right after meta-schema validation.
 */

type AjvError = { instancePath: string; message?: string; keyword: string; params?: Record<string, unknown> };
type Validate = { (data: unknown): boolean; errors?: AjvError[] | null };
type AjvLike = {
  addSchema(schema: object, key: string): unknown;
  compile(schema: object): Validate;
};

const DOC_ID = 'nouto-openapi-document';
const MAX_MESSAGES_PER_SITE = 3;

function createAjv(version: OpenApiAnalysis['version']): AjvLike {
  const options = { allErrors: true, strict: false, validateFormats: false };
  if (version === '3.0') {
    // OpenAPI 3.0 schemas are a draft-04 dialect (boolean exclusiveMaximum,
    // `nullable`), which Ajv v8 proper rejects.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AjvDraft04 = require('ajv-draft-04');
    return new AjvDraft04(options);
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Ajv2020 = require('ajv/dist/2020');
  return new (Ajv2020.default ?? Ajv2020)(options);
}

/**
 * Human wording for one Ajv error, relative to the example value.
 */
function describe(err: AjvError): string {
  const where = err.instancePath ? `${err.instancePath} ` : '';
  if (err.keyword === 'required' && typeof err.params?.missingProperty === 'string') {
    return `${where}is missing required property "${err.params.missingProperty}"`.trim();
  }
  if (err.keyword === 'additionalProperties' && typeof err.params?.additionalProperty === 'string') {
    return `${where}has unexpected property "${err.params.additionalProperty}"`.trim();
  }
  return `${where}${err.message ?? 'is invalid'}`.trim();
}

/** Ajv reports combinator failures alongside the branch errors; keep the leaves. */
const STRUCTURAL = new Set(['oneOf', 'anyOf', 'if', 'then', 'else', 'not', 'allOf']);

function summarize(errors: AjvError[]): string[] {
  const leaves = errors.filter((err) => !STRUCTURAL.has(err.keyword));
  const chosen = (leaves.length ? leaves : errors).slice(0, MAX_MESSAGES_PER_SITE);
  return chosen.map(describe);
}

/**
 * Validates every example site of an analyzed document. Returns `'lint'`
 * diagnostics coded with the site's rule id and anchored at the example
 * value, honouring `options` like `runLintRules` (a rule set to `'off'`
 * yields nothing and is not even validated).
 */
export function validateExampleSites(
  analysis: OpenApiAnalysis,
  options: LintOptions = {},
  sites: ExampleSite[] = collectExampleSites(analysis)
): OpenApiDiagnostic[] {
  const spec = analysis.parsedSpec;
  if (!spec || !analysis.version || sites.length === 0) return [];
  const severityFor = new Map(
    [EXAMPLE_INVALID_SCHEMA, EXAMPLE_INVALID_MEDIA].map((id) => {
      const rule = ALL_LINT_RULES.find((candidate) => candidate.id === id)!;
      return [id, effectiveSeverity(rule, options)] as const;
    })
  );
  const active = sites.filter((site) => severityFor.get(site.rule) !== 'off');
  if (active.length === 0) return [];

  let ajv: AjvLike;
  try {
    ajv = createAjv(analysis.version);
    ajv.addSchema(spec, DOC_ID);
  } catch {
    return [];
  }

  const diagnostics: OpenApiDiagnostic[] = [];
  const validators = new Map<string, Validate | null>();
  for (const site of active) {
    let validate = validators.get(site.schemaPointer);
    if (validate === undefined) {
      try {
        validate = ajv.compile({ $ref: `${DOC_ID}#${site.schemaPointer}` });
      } catch {
        // A schema Ajv cannot compile (unresolvable ref, unsupported keyword
        // combination) is reported by other passes; stay silent here.
        validate = null;
      }
      validators.set(site.schemaPointer, validate);
    }
    if (!validate) continue;
    let valid: boolean;
    try {
      valid = validate(site.value);
    } catch {
      continue;
    }
    if (valid) continue;
    const messages = summarize(validate.errors ?? []);
    const severity = severityFor.get(site.rule) as 'error' | 'warning';
    diagnostics.push({
      source: 'lint',
      severity,
      code: site.rule,
      pointer: site.valuePointer,
      message: `Example does not match its schema: ${messages.join('; ') || 'validation failed'}.`,
    });
  }
  return diagnostics;
}
