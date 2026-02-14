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
  scriptOutput.update((state) => ({ ...state, [phase]: result }));
}

export function clearScriptOutput() {
  scriptOutput.set(initialState);
}
