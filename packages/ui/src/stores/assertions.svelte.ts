import type { Assertion, AssertionResult } from '../types';
import { generateId } from '../types';

// Assertion results from the last execution
const _assertionResults = $state<{ value: AssertionResult[] }>({ value: [] });

export function assertionResults() { return _assertionResults.value; }

// Actions
export function setAssertionResults(results: AssertionResult[]) {
  _assertionResults.value = results;
}

export function clearAssertionResults() {
  _assertionResults.value = [];
}

// Derived: summary counts
export function assertionSummary() {
  const total = _assertionResults.value.length;
  const passed = _assertionResults.value.filter(r => r.passed).length;
  const failed = total - passed;
  return { total, passed, failed };
}

// Helper to create a new assertion with defaults
export function createDefaultAssertion(): Assertion {
  return {
    id: generateId(),
    enabled: true,
    target: 'status',
    operator: 'equals',
    expected: '200',
  };
}
