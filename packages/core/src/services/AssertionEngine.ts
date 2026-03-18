import type { Assertion, AssertionResult } from '../types';
import { JSONPath } from 'jsonpath-plus';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Cache Ajv instance at module level to avoid re-creating on every assertion
const _ajvInstance = new Ajv({ allErrors: true, strict: false });
addFormats(_ajvInstance);

interface ResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: any;
  duration: number;
  // gRPC-specific (optional, only present for gRPC responses)
  trailers?: Record<string, string>;
  grpcStatusMessage?: string;
  streamMessages?: { content: string; size?: number }[];
}

interface EvaluationResult {
  results: AssertionResult[];
  variablesToSet: { key: string; value: string }[];
}

export function evaluateAssertions(assertions: Assertion[], response: ResponseData): EvaluationResult {
  const results: AssertionResult[] = [];
  const variablesToSet: { key: string; value: string }[] = [];

  for (const assertion of assertions) {
    if (!assertion.enabled) continue;

    try {
      if (assertion.target === 'schema') {
        results.push(evaluateSchemaAssertion(assertion, response));
      } else if (assertion.target === 'setVariable') {
        const result = evaluateSetVariable(assertion, response);
        results.push(result.result);
        if (result.variable) {
          variablesToSet.push(result.variable);
        }
      } else {
        const actual = extractValue(assertion, response);
        const result = compareValues(assertion, actual);
        results.push(result);
      }
    } catch (err: any) {
      results.push({
        assertionId: assertion.id,
        passed: false,
        message: `Error: ${err.message}`,
      });
    }
  }

  return { results, variablesToSet };
}

function extractValue(assertion: Assertion, response: ResponseData): string | undefined {
  switch (assertion.target) {
    case 'status':
      return String(response.status);

    case 'responseTime':
      return String(response.duration);

    case 'body':
      if (response.data === null || response.data === undefined) return undefined;
      return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);

    case 'jsonQuery': {
      if (!assertion.property) return undefined;
      const data = typeof response.data === 'string' ? safeJsonParse(response.data) : response.data;
      if (data === undefined) return undefined;
      const results = JSONPath({ path: assertion.property, json: data, wrap: true });
      if (!results || results.length === 0) return undefined;
      const val = results.length === 1 ? results[0] : results;
      return typeof val === 'string' ? val : JSON.stringify(val);
    }

    case 'header': {
      if (!assertion.property) return undefined;
      const headerKey = assertion.property.toLowerCase();
      for (const [k, v] of Object.entries(response.headers)) {
        if (k.toLowerCase() === headerKey) return v;
      }
      return undefined;
    }

    case 'contentType': {
      for (const [k, v] of Object.entries(response.headers)) {
        if (k.toLowerCase() === 'content-type') return v;
      }
      return undefined;
    }

    case 'grpcStatusMessage':
      return response.grpcStatusMessage;

    case 'trailer': {
      if (!assertion.property) return undefined;
      const trailerKey = assertion.property.toLowerCase();
      const trailers = response.trailers || {};
      for (const [k, v] of Object.entries(trailers)) {
        if (k.toLowerCase() === trailerKey) return v;
      }
      return undefined;
    }

    case 'streamMessageCount': {
      if (!response.streamMessages) return undefined;
      return String(response.streamMessages.length);
    }

    case 'streamMessage': {
      const msgs = response.streamMessages || [];
      if (!assertion.property) return undefined;
      // Parse "index" or "index.$.jsonpath"
      const dotIdx = assertion.property.indexOf('.');
      const indexStr = dotIdx === -1 ? assertion.property : assertion.property.substring(0, dotIdx);
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx) || idx < 0 || idx >= msgs.length) return undefined;
      const msgContent = msgs[idx].content;
      if (dotIdx === -1) return msgContent;
      // JSONPath on the message
      const jsonPath = assertion.property.substring(dotIdx + 1);
      const data = safeJsonParse(msgContent);
      if (data === undefined) return msgContent;
      const results = JSONPath({ path: jsonPath, json: data, wrap: true });
      if (!results || results.length === 0) return undefined;
      const val = results.length === 1 ? results[0] : results;
      return typeof val === 'string' ? val : JSON.stringify(val);
    }

    default:
      return undefined;
  }
}

function compareValues(assertion: Assertion, actual: string | undefined): AssertionResult {
  const expected = assertion.expected;
  const assertionId = assertion.id;

  switch (assertion.operator) {
    case 'equals':
      return {
        assertionId,
        passed: smartEquals(actual, expected),
        actual,
        expected,
        message: smartEquals(actual, expected) ? 'Values are equal' : `Expected "${expected}" but got "${actual}"`,
      };

    case 'notEquals':
      return {
        assertionId,
        passed: !smartEquals(actual, expected),
        actual,
        expected,
        message: !smartEquals(actual, expected) ? 'Values are not equal' : `Expected values to differ but both are "${actual}"`,
      };

    case 'contains':
      const contains = actual !== undefined && expected !== undefined && actual.includes(expected);
      return {
        assertionId,
        passed: contains,
        actual,
        expected,
        message: contains ? `Contains "${expected}"` : `"${actual}" does not contain "${expected}"`,
      };

    case 'notContains':
      const notContains = actual === undefined || expected === undefined || !actual.includes(expected);
      return {
        assertionId,
        passed: notContains,
        actual,
        expected,
        message: notContains ? `Does not contain "${expected}"` : `"${actual}" contains "${expected}"`,
      };

    case 'greaterThan':
      return numericCompare(assertionId, actual, expected, (a, b) => a > b, '>');

    case 'lessThan':
      return numericCompare(assertionId, actual, expected, (a, b) => a < b, '<');

    case 'greaterThanOrEqual':
      return numericCompare(assertionId, actual, expected, (a, b) => a >= b, '>=');

    case 'lessThanOrEqual':
      return numericCompare(assertionId, actual, expected, (a, b) => a <= b, '<=');

    case 'exists':
      return {
        assertionId,
        passed: actual !== undefined && actual !== null,
        actual,
        message: actual !== undefined && actual !== null ? 'Value exists' : 'Value does not exist',
      };

    case 'notExists':
      return {
        assertionId,
        passed: actual === undefined || actual === null,
        actual,
        message: actual === undefined || actual === null ? 'Value does not exist' : `Value exists: "${actual}"`,
      };

    case 'isType': {
      const actualType = getValueType(actual);
      const passed = actualType === expected;
      return {
        assertionId,
        passed,
        actual: actualType,
        expected,
        message: passed ? `Type is "${expected}"` : `Expected type "${expected}" but got "${actualType}"`,
      };
    }

    case 'isJson': {
      let isValid = false;
      if (actual !== undefined) {
        try {
          JSON.parse(actual);
          isValid = true;
        } catch { /* not JSON */ }
      }
      return {
        assertionId,
        passed: isValid,
        actual: actual !== undefined ? (actual.length > 50 ? actual.substring(0, 50) + '...' : actual) : undefined,
        message: isValid ? 'Value is valid JSON' : 'Value is not valid JSON',
      };
    }

    case 'count': {
      let count = 0;
      if (actual !== undefined) {
        try {
          const parsed = JSON.parse(actual);
          count = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
        } catch {
          count = 0;
        }
      }
      const expectedNum = expected ? Number(expected) : NaN;
      const passed = count === expectedNum;
      return {
        assertionId,
        passed,
        actual: String(count),
        expected,
        message: passed ? `Count is ${count}` : `Expected count ${expected} but got ${count}`,
      };
    }

    case 'matches': {
      let passed = false;
      if (actual !== undefined && expected !== undefined) {
        try {
          const regex = new RegExp(expected);
          passed = regex.test(actual);
        } catch { /* invalid regex */ }
      }
      return {
        assertionId,
        passed,
        actual,
        expected,
        message: passed ? `Matches pattern "${expected}"` : `"${actual}" does not match pattern "${expected}"`,
      };
    }

    case 'anyItemContains':
    case 'anyItemStartsWith':
    case 'anyItemEndsWith':
    case 'anyItemEquals': {
      const arr = safeJsonParse(actual ?? '') ?? (actual !== undefined ? [actual] : []);
      const items: string[] = Array.isArray(arr) ? arr.map(String) : [String(arr)];
      const exp = expected ?? '';
      let passed = false;
      if (assertion.operator === 'anyItemContains') {
        passed = items.some(el => el.includes(exp));
      } else if (assertion.operator === 'anyItemStartsWith') {
        passed = items.some(el => el.startsWith(exp));
      } else if (assertion.operator === 'anyItemEndsWith') {
        passed = items.some(el => el.endsWith(exp));
      } else {
        passed = items.some(el => el === exp);
      }
      const opLabel = assertion.operator.replace('anyItem', '').toLowerCase();
      return {
        assertionId,
        passed,
        actual,
        expected,
        message: passed
          ? `At least one array item ${opLabel}s "${exp}"`
          : `No array item ${opLabel}s "${exp}" in ${actual}`,
      };
    }

    default:
      return {
        assertionId,
        passed: false,
        message: `Unknown operator: ${assertion.operator}`,
      };
  }
}

function evaluateSchemaAssertion(assertion: Assertion, response: ResponseData): AssertionResult {
  const assertionId = assertion.id;
  const schemaStr = assertion.expected;

  if (!schemaStr) {
    return { assertionId, passed: false, message: 'Schema is empty - paste a JSON Schema into the expected field' };
  }

  let schema: any;
  try {
    schema = JSON.parse(schemaStr);
  } catch {
    return { assertionId, passed: false, message: 'Schema is not valid JSON' };
  }

  const data = typeof response.data === 'string' ? safeJsonParse(response.data) : response.data;
  if (data === undefined) {
    return { assertionId, passed: false, message: 'Response body is not valid JSON - cannot validate schema' };
  }

  try {
    const validate = _ajvInstance.compile(schema);
    const valid = validate(data);

    if (valid) {
      return { assertionId, passed: true, message: 'Response body matches the JSON Schema' };
    }

    const errors = (validate.errors ?? [])
      .slice(0, 3)
      .map(e => `${e.instancePath || '(root)'} ${e.message}`)
      .join('; ');
    return {
      assertionId,
      passed: false,
      message: `Schema validation failed: ${errors}${(validate.errors?.length ?? 0) > 3 ? ' (and more)' : ''}`,
    };
  } catch (err: any) {
    return { assertionId, passed: false, message: `Schema validation error: ${err.message}` };
  }
}

function evaluateSetVariable(
  assertion: Assertion,
  response: ResponseData
): { result: AssertionResult; variable?: { key: string; value: string } } {
  if (!assertion.variableName) {
    return {
      result: {
        assertionId: assertion.id,
        passed: false,
        message: 'Variable name is required for setVariable',
      },
    };
  }

  let value: string | undefined;
  if (assertion.property) {
    const data = typeof response.data === 'string' ? safeJsonParse(response.data) : response.data;
    if (data !== undefined) {
      const results = JSONPath({ path: assertion.property, json: data, wrap: true });
      if (results && results.length > 0) {
        value = typeof results[0] === 'string' ? results[0] : JSON.stringify(results[0]);
      }
    }
  }

  if (value !== undefined) {
    return {
      result: {
        assertionId: assertion.id,
        passed: true,
        actual: value,
        message: `Set variable "${assertion.variableName}" = "${value}"`,
      },
      variable: { key: assertion.variableName, value },
    };
  }

  return {
    result: {
      assertionId: assertion.id,
      passed: false,
      message: `Could not extract value for variable "${assertion.variableName}" from path "${assertion.property}"`,
    },
  };
}

function smartEquals(actual: string | undefined, expected: string | undefined): boolean {
  if (actual === expected) return true;
  if (actual === undefined || expected === undefined) return false;

  // Try numeric comparison
  const numA = Number(actual);
  const numB = Number(expected);
  if (!isNaN(numA) && !isNaN(numB)) {
    return numA === numB;
  }

  return actual === expected;
}

function numericCompare(
  assertionId: string,
  actual: string | undefined,
  expected: string | undefined,
  comparator: (a: number, b: number) => boolean,
  symbol: string
): AssertionResult {
  const numA = actual !== undefined ? Number(actual) : NaN;
  const numB = expected !== undefined ? Number(expected) : NaN;

  if (isNaN(numA) || isNaN(numB)) {
    return {
      assertionId,
      passed: false,
      actual,
      expected,
      message: `Cannot compare non-numeric values: "${actual}" ${symbol} "${expected}"`,
    };
  }

  const passed = comparator(numA, numB);
  return {
    assertionId,
    passed,
    actual,
    expected,
    message: passed ? `${numA} ${symbol} ${numB}` : `${numA} is not ${symbol} ${numB}`,
  };
}

function getValueType(value: string | undefined): string {
  if (value === undefined || value === null) return 'undefined';
  try {
    const parsed = JSON.parse(value);
    if (parsed === null) return 'null';
    if (Array.isArray(parsed)) return 'array';
    return typeof parsed;
  } catch {
    return 'string';
  }
}

function safeJsonParse(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}
