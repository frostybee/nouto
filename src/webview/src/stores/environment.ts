import { writable, derived, get } from 'svelte/store';
import { postMessage } from '../lib/vscode';

export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
}

// Store for all environments
export const environments = writable<Environment[]>([]);

// Currently active environment ID
export const activeEnvironmentId = writable<string | null>(null);

// Derived store for the active environment
export const activeEnvironment = derived(
  [environments, activeEnvironmentId],
  ([$environments, $activeId]) => {
    if (!$activeId) return null;
    return $environments.find((env) => env.id === $activeId) || null;
  }
);

// Derived store for active variables as a map
export const activeVariables = derived(activeEnvironment, ($env) => {
  if (!$env) return new Map<string, string>();
  const map = new Map<string, string>();
  for (const v of $env.variables) {
    if (v.enabled && v.key) {
      map.set(v.key, v.value);
    }
  }
  return map;
});

// Helper to generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Environment management functions
export function addEnvironment(name: string): Environment {
  const env: Environment = {
    id: generateId(),
    name,
    variables: [],
  };
  environments.update((envs) => [...envs, env]);
  saveEnvironments();
  return env;
}

export function deleteEnvironment(id: string) {
  environments.update((envs) => envs.filter((e) => e.id !== id));
  activeEnvironmentId.update((activeId) => (activeId === id ? null : activeId));
  saveEnvironments();
}

export function renameEnvironment(id: string, name: string) {
  environments.update((envs) =>
    envs.map((e) => (e.id === id ? { ...e, name } : e))
  );
  saveEnvironments();
}

export function setActiveEnvironment(id: string | null) {
  activeEnvironmentId.set(id);
  saveEnvironments();
}

export function updateEnvironmentVariables(id: string, variables: EnvironmentVariable[]) {
  environments.update((envs) =>
    envs.map((e) => (e.id === id ? { ...e, variables } : e))
  );
  saveEnvironments();
}

export function loadEnvironments(data: { environments: Environment[]; activeId: string | null }) {
  environments.set(data.environments || []);
  activeEnvironmentId.set(data.activeId);
}

function saveEnvironments() {
  const envs = get(environments);
  const activeId = get(activeEnvironmentId);
  postMessage({
    type: 'saveEnvironments',
    data: { environments: envs, activeId },
  });
}

// Variable substitution function
// Replaces {{variableName}} with the variable value
export function substituteVariables(text: string): string {
  const vars = get(activeVariables);
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return vars.has(varName) ? vars.get(varName)! : match;
  });
}
