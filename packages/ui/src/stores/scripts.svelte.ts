import type { ScriptResult } from '../types';

interface ScriptOutputState {
  preRequest: ScriptResult | null;
  postResponse: ScriptResult | null;
}

export const scriptOutput = $state<ScriptOutputState>({
  preRequest: null,
  postResponse: null,
});

export function setScriptOutput(phase: 'preRequest' | 'postResponse', result: ScriptResult) {
  const existing = scriptOutput[phase];
  if (!existing) {
    scriptOutput[phase] = result;
    return;
  }
  // Accumulate results from multiple script levels in the chain
  scriptOutput[phase] = {
    success: existing.success && result.success,
    error: result.error ? (existing.error ? `${existing.error}\n${result.error}` : result.error) : existing.error,
    logs: [...(existing.logs ?? []), ...result.logs],
    testResults: [...(existing.testResults ?? []), ...result.testResults],
    variablesToSet: [...(existing.variablesToSet ?? []), ...result.variablesToSet],
    modifiedRequest: result.modifiedRequest ? { ...existing.modifiedRequest, ...result.modifiedRequest } : existing.modifiedRequest,
    nextRequest: result.nextRequest || existing.nextRequest,
    duration: existing.duration + result.duration,
  };
}

export function clearScriptOutput() {
  scriptOutput.preRequest = null;
  scriptOutput.postResponse = null;
}
