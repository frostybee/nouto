import { describe, it, expect, beforeEach } from 'vitest';
import { scriptOutput, setScriptOutput, clearScriptOutput } from './scripts.svelte';
import type { ScriptResult } from '../types';

function makeResult(overrides: Partial<ScriptResult> = {}): ScriptResult {
  return {
    success: true,
    logs: [],
    testResults: [],
    variablesToSet: [],
    duration: 0,
    ...overrides,
  };
}

describe('scripts store', () => {
  beforeEach(() => {
    clearScriptOutput();
  });

  it('should start with null values', () => {
    const state = scriptOutput;
    expect(state.preRequest).toBeNull();
    expect(state.postResponse).toBeNull();
  });

  it('should set first script result directly', () => {
    const result = makeResult({
      logs: [{ level: 'log', args: ['hello'], timestamp: 0 }],
      duration: 5,
    });
    setScriptOutput('preRequest', result);
    const state = scriptOutput;
    expect(state.preRequest).toEqual(result);
    expect(state.postResponse).toBeNull();
  });

  it('should accumulate logs from multiple script levels', () => {
    const collectionResult = makeResult({
      logs: [{ level: 'log', args: ['from collection'], timestamp: 0 }],
      duration: 2,
    });
    const folderResult = makeResult({
      logs: [{ level: 'log', args: ['from folder'], timestamp: 1 }],
      duration: 3,
    });

    setScriptOutput('preRequest', collectionResult);
    setScriptOutput('preRequest', folderResult);

    const state = scriptOutput;
    expect(state.preRequest!.logs).toHaveLength(2);
    expect(state.preRequest!.logs[0].args).toEqual(['from collection']);
    expect(state.preRequest!.logs[1].args).toEqual(['from folder']);
  });

  it('should accumulate duration across levels', () => {
    setScriptOutput('postResponse', makeResult({ duration: 10 }));
    setScriptOutput('postResponse', makeResult({ duration: 7 }));

    const state = scriptOutput;
    expect(state.postResponse!.duration).toBe(17);
  });

  it('should mark success as false if any level fails', () => {
    setScriptOutput('preRequest', makeResult({ success: true }));
    setScriptOutput('preRequest', makeResult({ success: false, error: 'syntax error' }));

    const state = scriptOutput;
    expect(state.preRequest!.success).toBe(false);
    expect(state.preRequest!.error).toBe('syntax error');
  });

  it('should concatenate errors from multiple failing levels', () => {
    setScriptOutput('preRequest', makeResult({ success: false, error: 'error 1' }));
    setScriptOutput('preRequest', makeResult({ success: false, error: 'error 2' }));

    const state = scriptOutput;
    expect(state.preRequest!.error).toBe('error 1\nerror 2');
  });

  it('should accumulate test results across levels', () => {
    setScriptOutput('postResponse', makeResult({
      testResults: [{ name: 'status is 200', passed: true }],
    }));
    setScriptOutput('postResponse', makeResult({
      testResults: [{ name: 'body has data', passed: false, error: 'missing' }],
    }));

    const state = scriptOutput;
    expect(state.postResponse!.testResults).toHaveLength(2);
    expect(state.postResponse!.testResults[0].name).toBe('status is 200');
    expect(state.postResponse!.testResults[1].name).toBe('body has data');
  });

  it('should accumulate variablesToSet across levels', () => {
    setScriptOutput('preRequest', makeResult({
      variablesToSet: [{ key: 'token', value: 'abc', scope: 'environment' }],
    }));
    setScriptOutput('preRequest', makeResult({
      variablesToSet: [{ key: 'host', value: 'localhost', scope: 'global' }],
    }));

    const state = scriptOutput;
    expect(state.preRequest!.variablesToSet).toHaveLength(2);
  });

  it('should keep pre and post phases independent', () => {
    setScriptOutput('preRequest', makeResult({
      logs: [{ level: 'log', args: ['pre'], timestamp: 0 }],
    }));
    setScriptOutput('postResponse', makeResult({
      logs: [{ level: 'log', args: ['post'], timestamp: 0 }],
    }));

    const state = scriptOutput;
    expect(state.preRequest!.logs).toHaveLength(1);
    expect(state.postResponse!.logs).toHaveLength(1);
  });

  it('should reset on clearScriptOutput', () => {
    setScriptOutput('preRequest', makeResult({ duration: 5 }));
    setScriptOutput('postResponse', makeResult({ duration: 3 }));

    clearScriptOutput();

    const state = scriptOutput;
    expect(state.preRequest).toBeNull();
    expect(state.postResponse).toBeNull();
  });
});
