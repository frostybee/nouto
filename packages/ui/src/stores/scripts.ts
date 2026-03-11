import { writable } from 'svelte/store';
import type { ScriptResult } from '../types';

interface ScriptOutputState {
  preRequest: ScriptResult | null;
  postResponse: ScriptResult | null;
}

const initialState: ScriptOutputState = {
  preRequest: null,
  postResponse: null,
};

export const scriptOutput = writable<ScriptOutputState>(initialState);

export function setScriptOutput(phase: 'preRequest' | 'postResponse', result: ScriptResult) {
  scriptOutput.update((state) => {
    const existing = state[phase];
    if (!existing) {
      return { ...state, [phase]: result };
    }
    // Accumulate results from multiple script levels in the chain
    const merged: ScriptResult = {
      success: existing.success && result.success,
      error: result.error ? (existing.error ? `${existing.error}\n${result.error}` : result.error) : existing.error,
      logs: [...existing.logs, ...result.logs],
      testResults: [...existing.testResults, ...result.testResults],
      variablesToSet: [...existing.variablesToSet, ...result.variablesToSet],
      modifiedRequest: result.modifiedRequest ? { ...existing.modifiedRequest, ...result.modifiedRequest } : existing.modifiedRequest,
      nextRequest: result.nextRequest || existing.nextRequest,
      duration: existing.duration + result.duration,
    };
    return { ...state, [phase]: merged };
  });
}

export function clearScriptOutput() {
  scriptOutput.set(initialState);
}
