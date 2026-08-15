import { buildPointer } from '../../pointer';
import type { LintFinding, LintRule } from '../types';
import { isRecord, mergedParameters, operationViews, securitySchemes, specOf } from '../context';
import { walkParameters, walkSchemas } from '../schemaWalk';

/**
 * OWASP API Security Top 10 checks, modelled on the vacuum/Spectral OWASP
 * ruleset. On by default at `warning` like the other security rules; teams
 * whose API is not security-sensitive turn the group down in Settings.
 */

/** Placeholder bounds the OWASP fixes insert. */
export const OWASP_FIX_VALUES = {
  minimum: 0,
  maximum: 1000000,
  maxLength: 255,
  maxItems: 100,
  format: 'int64',
} as const;

function declaredTypes(schema: Record<string, unknown>): string[] {
  if (typeof schema.type === 'string') return [schema.type];
  if (Array.isArray(schema.type)) return schema.type.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

/** Sites already covered by `parameter-unbounded` (operation parameter schemas). */
const PARAMETER_SCHEMA = /\/parameters\/\d+\/schema$/;

const integerUnbounded: LintRule = {
  id: 'owasp-integer-unbounded',
  description: 'Integer schema has no minimum and maximum, allowing out-of-range values.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (!declaredTypes(schema).includes('integer') || schema.enum !== undefined || schema.const !== undefined) continue;
      const missing = ['minimum', 'maximum'].filter(
        (bound) => schema[bound] === undefined && schema[`exclusive${bound[0].toUpperCase()}${bound.slice(1)}`] === undefined
      );
      if (missing.length === 0) continue;
      findings.push({
        message: `Integer schema has no ${missing.join(' or ')}; bound it to reject out-of-range values.`,
        pointer,
        anchor: true,
      });
    }
    return findings;
  },
};

const integerNoFormat: LintRule = {
  id: 'owasp-integer-no-format',
  description: 'Integer schema declares no format (int32/int64), leaving its size unspecified.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (!declaredTypes(schema).includes('integer')) continue;
      if (schema.format === 'int32' || schema.format === 'int64') continue;
      findings.push({ message: 'Integer schema has no format (int32 or int64).', pointer, anchor: true });
    }
    return findings;
  },
};

const stringUnrestricted: LintRule = {
  id: 'owasp-string-unrestricted',
  description: 'String schema has no maxLength, pattern, enum, format, or const, allowing arbitrary input.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (!declaredTypes(schema).includes('string') || PARAMETER_SCHEMA.test(pointer)) continue;
      const restricted = ['maxLength', 'pattern', 'enum', 'format', 'const'].some((key) => schema[key] !== undefined);
      if (restricted) continue;
      findings.push({ message: 'String schema has no maxLength, pattern, enum, format, or const.', pointer, anchor: true });
    }
    return findings;
  },
};

const arrayUnbounded: LintRule = {
  id: 'owasp-array-unbounded',
  description: 'Array schema has no maxItems, allowing unbounded payloads.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { schema, pointer } of walkSchemas(analysis)) {
      if (!declaredTypes(schema).includes('array') || PARAMETER_SCHEMA.test(pointer)) continue;
      if (schema.maxItems !== undefined) continue;
      findings.push({ message: 'Array schema has no maxItems.', pointer, anchor: true });
    }
    return findings;
  },
};

/** True when the operation runs with at least one security requirement. */
function operationIsSecured(spec: Record<string, unknown>, operation: Record<string, unknown>): boolean {
  if (Array.isArray(operation.security)) return operation.security.length > 0;
  return Array.isArray(spec.security) && spec.security.length > 0;
}

function responseCodes(operation: Record<string, unknown>): Set<string> {
  return new Set(isRecord(operation.responses) ? Object.keys(operation.responses) : []);
}

function missingResponseRule(id: string, code: string, label: string, onlyWhenSecured: boolean): LintRule {
  return {
    id,
    description: `Operation declares no ${code} (${label}) response${onlyWhenSecured ? ' although it requires authentication' : ''}.`,
    defaultSeverity: 'warning',
    run(analysis) {
      const spec = specOf(analysis);
      if (!spec) return [];
      const findings: LintFinding[] = [];
      for (const { summary, object } of operationViews(analysis)) {
        if (!isRecord(object.responses)) continue;
        if (onlyWhenSecured && !operationIsSecured(spec, object)) continue;
        if (responseCodes(object).has(code)) continue;
        findings.push({
          message: `Operation ${summary.method.toUpperCase()} ${summary.path} declares no ${code} ${label} response.`,
          pointer: `${summary.pointer}/responses`,
          anchor: true,
        });
      }
      return findings;
    },
  };
}

const response401Missing = missingResponseRule('owasp-response-401-missing', '401', 'Unauthorized', true);
const response429Missing = missingResponseRule('owasp-response-429-missing', '429', 'Too Many Requests', false);
const response500Missing = missingResponseRule('owasp-response-500-missing', '500', 'Internal Server Error', false);

const retryAfter: LintRule = {
  id: 'owasp-429-retry-after',
  description: 'A 429 response declares no Retry-After header, so clients cannot back off correctly.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { summary, object } of operationViews(analysis)) {
      const responses = isRecord(object.responses) ? object.responses : undefined;
      const response = responses?.['429'];
      if (!isRecord(response) || '$ref' in response) continue;
      const headers = isRecord(response.headers) ? response.headers : {};
      if (Object.keys(headers).some((name) => name.toLowerCase() === 'retry-after')) continue;
      findings.push({
        message: `429 response of ${summary.method.toUpperCase()} ${summary.path} declares no Retry-After header.`,
        pointer: `${summary.pointer}/responses/429`,
        anchor: true,
      });
    }
    return findings;
  },
};

const RFC_8725 = /rfc\s*-?\s*8725/i;

const jwtBestPractices: LintRule = {
  id: 'owasp-jwt-best-practices',
  description: 'A JWT-bearing security scheme should state that it follows RFC 8725 (JSON Web Token best practices).',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const [name, scheme] of securitySchemes(spec)) {
      const isJwt =
        (scheme.type === 'http' && String(scheme.scheme).toLowerCase() === 'bearer' && /jwt/i.test(String(scheme.bearerFormat ?? ''))) ||
        scheme.type === 'oauth2' ||
        scheme.type === 'openIdConnect';
      if (!isJwt) continue;
      if (typeof scheme.description === 'string' && RFC_8725.test(scheme.description)) continue;
      findings.push({
        message: `Security scheme "${name}" issues JWTs; its description should reference RFC 8725 best practices.`,
        pointer: buildPointer(['components', 'securitySchemes', name]),
        anchor: true,
      });
    }
    return findings;
  },
};

const INSECURE_HTTP_SCHEMES = new Set(['negotiate', 'oauth']);

const authInsecureScheme: LintRule = {
  id: 'owasp-auth-insecure-scheme',
  description: 'HTTP security scheme uses an outdated mechanism (negotiate, oauth 1.0).',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const [name, scheme] of securitySchemes(spec)) {
      if (scheme.type !== 'http') continue;
      const mechanism = String(scheme.scheme ?? '').toLowerCase();
      if (!INSECURE_HTTP_SCHEMES.has(mechanism)) continue;
      findings.push({
        message: `Security scheme "${name}" uses the insecure "${mechanism}" HTTP authentication scheme.`,
        pointer: buildPointer(['components', 'securitySchemes', name, 'scheme']),
      });
    }
    return findings;
  },
};

const CREDENTIAL_NAME = /(api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|client[-_]?secret|password|passwd|secret|^token$|^auth$|^authorization$)/i;

const credentialsInQuery: LintRule = {
  id: 'owasp-credentials-in-query',
  description: 'A query parameter looks like a credential (token, api key, secret, password); query strings leak into logs.',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    for (const { parameter, pointer } of walkParameters(analysis)) {
      if (parameter.in !== 'query' || typeof parameter.name !== 'string') continue;
      if (!CREDENTIAL_NAME.test(parameter.name)) continue;
      findings.push({
        message: `Query parameter "${parameter.name}" looks like a credential; pass it in a header instead.`,
        pointer,
        anchor: true,
      });
    }
    return findings;
  },
};

const numericId: LintRule = {
  id: 'owasp-numeric-id',
  description: 'A path parameter named like an identifier is an integer; sequential ids invite enumeration (BOLA).',
  defaultSeverity: 'warning',
  run(analysis) {
    const findings: LintFinding[] = [];
    const seen = new Set<string>();
    for (const view of operationViews(analysis)) {
      for (const param of mergedParameters(view, analysis)) {
        if (param.in !== 'path' || !/id$/i.test(param.name) || seen.has(param.pointer)) continue;
        const schema = isRecord(param.object.schema) ? param.object.schema : undefined;
        if (!schema || !declaredTypes(schema).includes('integer')) continue;
        seen.add(param.pointer);
        findings.push({
          message: `Path parameter "${param.name}" is an integer id; prefer opaque identifiers (UUIDs) to prevent enumeration.`,
          pointer: param.pointer,
          anchor: true,
        });
      }
    }
    return findings;
  },
};

const SAFE_METHODS = new Set(['get', 'head', 'options', 'trace']);

const unsafeOperationUnprotected: LintRule = {
  id: 'owasp-unsafe-operation-unprotected',
  description: 'A state-changing operation (POST/PUT/PATCH/DELETE/...) runs without any security requirement.',
  defaultSeverity: 'warning',
  run(analysis) {
    const spec = specOf(analysis);
    if (!spec) return [];
    const findings: LintFinding[] = [];
    for (const { summary, object } of operationViews(analysis)) {
      if (SAFE_METHODS.has(summary.method.toLowerCase())) continue;
      if (operationIsSecured(spec, object)) continue;
      findings.push({
        message: `Unsafe operation ${summary.method.toUpperCase()} ${summary.path} has no security requirement.`,
        pointer: summary.pointer,
        anchor: true,
      });
    }
    return findings;
  },
};

export const owaspRules: LintRule[] = [
  integerUnbounded,
  integerNoFormat,
  stringUnrestricted,
  arrayUnbounded,
  response401Missing,
  response429Missing,
  response500Missing,
  retryAfter,
  jwtBestPractices,
  authInsecureScheme,
  credentialsInQuery,
  numericId,
  unsafeOperationUnprotected,
];
