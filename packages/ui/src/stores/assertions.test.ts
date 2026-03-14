import { describe, it, expect, beforeEach } from 'vitest';
import type { AssertionResult } from '../types';
import {
  assertionResults,
  setAssertionResults,
  clearAssertionResults,
  assertionSummary,
  createDefaultAssertion,
} from './assertions.svelte';

describe('assertions store', () => {
  beforeEach(() => {
    clearAssertionResults();
  });

  describe('initial state', () => {
    it('should start with an empty results array', () => {
      expect(assertionResults()).toEqual([]);
    });

    it('should have a zeroed summary initially', () => {
      const summary = assertionSummary();
      expect(summary).toEqual({ total: 0, passed: 0, failed: 0 });
    });
  });

  describe('setAssertionResults', () => {
    it('should set assertion results', () => {
      const results: AssertionResult[] = [
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'Status is 200' },
      ];
      setAssertionResults(results);
      expect(assertionResults()).toEqual(results);
    });

    it('should replace previous results', () => {
      const first: AssertionResult[] = [
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'OK' },
      ];
      const second: AssertionResult[] = [
        { assertionId: 'a2', passed: false, actual: '404', expected: '200', message: 'Not found' },
      ];
      setAssertionResults(first);
      setAssertionResults(second);
      expect(assertionResults()).toEqual(second);
      expect(assertionResults().length).toBe(1);
    });

    it('should handle an empty array', () => {
      setAssertionResults([
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'OK' },
      ]);
      setAssertionResults([]);
      expect(assertionResults()).toEqual([]);
    });
  });

  describe('clearAssertionResults', () => {
    it('should clear all results', () => {
      setAssertionResults([
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'OK' },
        { assertionId: 'a2', passed: false, actual: '500', expected: '200', message: 'Server error' },
      ]);
      clearAssertionResults();
      expect(assertionResults()).toEqual([]);
    });

    it('should be safe to call when already empty', () => {
      clearAssertionResults();
      expect(assertionResults()).toEqual([]);
    });
  });

  describe('assertionSummary', () => {
    it('should count all passed results', () => {
      setAssertionResults([
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'OK' },
        { assertionId: 'a2', passed: true, actual: 'application/json', expected: 'application/json', message: 'Content-Type matches' },
      ]);
      expect(assertionSummary()).toEqual({ total: 2, passed: 2, failed: 0 });
    });

    it('should count all failed results', () => {
      setAssertionResults([
        { assertionId: 'a1', passed: false, actual: '500', expected: '200', message: 'Status mismatch' },
        { assertionId: 'a2', passed: false, actual: 'text/html', expected: 'application/json', message: 'Wrong content type' },
      ]);
      expect(assertionSummary()).toEqual({ total: 2, passed: 0, failed: 2 });
    });

    it('should correctly split a mix of passed and failed', () => {
      setAssertionResults([
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'OK' },
        { assertionId: 'a2', passed: false, actual: '500', expected: '200', message: 'Status mismatch' },
        { assertionId: 'a3', passed: true, actual: 'abc', expected: 'abc', message: 'Body match' },
        { assertionId: 'a4', passed: false, actual: '0', expected: '1', message: 'Header count mismatch' },
        { assertionId: 'a5', passed: true, actual: 'ok', expected: 'ok', message: 'Value match' },
      ]);
      expect(assertionSummary()).toEqual({ total: 5, passed: 3, failed: 2 });
    });

    it('should update when results change', () => {
      setAssertionResults([
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'OK' },
      ]);
      expect(assertionSummary().total).toBe(1);

      setAssertionResults([
        { assertionId: 'a1', passed: true, actual: '200', expected: '200', message: 'OK' },
        { assertionId: 'a2', passed: false, actual: '404', expected: '200', message: 'Not found' },
      ]);
      expect(assertionSummary()).toEqual({ total: 2, passed: 1, failed: 1 });
    });
  });

  describe('createDefaultAssertion', () => {
    it('should return an assertion with default values', () => {
      const assertion = createDefaultAssertion();
      expect(assertion.enabled).toBe(true);
      expect(assertion.target).toBe('status');
      expect(assertion.operator).toBe('equals');
      expect(assertion.expected).toBe('200');
    });

    it('should have a non-empty id', () => {
      const assertion = createDefaultAssertion();
      expect(assertion.id).toBeTruthy();
      expect(typeof assertion.id).toBe('string');
      expect(assertion.id.length).toBeGreaterThan(0);
    });

    it('should generate unique IDs for each call', () => {
      const a1 = createDefaultAssertion();
      const a2 = createDefaultAssertion();
      const a3 = createDefaultAssertion();
      expect(a1.id).not.toBe(a2.id);
      expect(a2.id).not.toBe(a3.id);
      expect(a1.id).not.toBe(a3.id);
    });
  });
});
