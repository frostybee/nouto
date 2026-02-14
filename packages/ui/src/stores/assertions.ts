import { writable, derived, get } from 'svelte/store';
import type { Assertion, AssertionResult } from '../types';
import { generateId } from '../types';

// Assertion results from the last execution
export const assertionResults = writable<AssertionResult[]>([]);

// Actions
export function setAssertionResults(results: AssertionResult[]) {
  assertionResults.set(results);
}

export function clearAssertionResults() {
  assertionResults.set([]);
}

// Derived: summary counts
export const assertionSummary = derived(assertionResults, ($results) => {
  const total = $results.length;
  const passed = $results.filter(r => r.passed).length;
  const failed = total - passed;
  return { total, passed, failed };
});

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
