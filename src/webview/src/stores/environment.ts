import { writable, derived, get } from 'svelte/store';
import { postMessage } from '../lib/vscode';
import { getResponseValue } from './responseContext';

export interface EnvironmentVariable {
  key: string;
  value: string;
  enabled: boolean;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  isGlobal?: boolean;
}

// Store for all environments
export const environments = writable<Environment[]>([]);

// Global variables store (always active)
export const globalVariables = writable<EnvironmentVariable[]>([]);

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

// Derived store for active variables as a map (includes global variables)
export const activeVariables = derived(
  [activeEnvironment, globalVariables],
  ([$env, $globalVars]) => {
    const map = new Map<string, string>();

    // First add global variables (can be overridden by environment variables)
    for (const v of $globalVars) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value);
      }
    }

    // Then add environment variables (override global)
    if ($env) {
      for (const v of $env.variables) {
        if (v.enabled && v.key) {
          map.set(v.key, v.value);
        }
      }
    }

    return map;
  }
);

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

export function duplicateEnvironment(id: string): Environment | null {
  const envs = get(environments);
  const source = envs.find((e) => e.id === id);
  if (!source) return null;

  const duplicated: Environment = {
    id: generateId(),
    name: `${source.name} (Copy)`,
    variables: source.variables.map((v) => ({ ...v })),
  };
  environments.update((envs) => [...envs, duplicated]);
  saveEnvironments();
  return duplicated;
}

export function updateGlobalVariables(variables: EnvironmentVariable[]) {
  globalVariables.set(variables);
  saveEnvironments();
}

export function loadEnvironments(data: {
  environments: Environment[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
}) {
  environments.set(data.environments || []);
  activeEnvironmentId.set(data.activeId);
  globalVariables.set(data.globalVariables || []);
}

function saveEnvironments() {
  const envs = get(environments);
  const activeId = get(activeEnvironmentId);
  const globalVars = get(globalVariables);
  postMessage({
    type: 'saveEnvironments',
    data: { environments: envs, activeId, globalVariables: globalVars },
  });
}

// Variable substitution function
// Replaces variables with their values
// Supported patterns:
// {{variableName}}           - environment variable
// {{$response.body.token}}   - last response body
// {{$response.headers.auth}} - last response headers
// {{$response.status}}       - last response status
// {{$guid}}                  - generate UUID
// {{$timestamp}}             - current timestamp (Unix epoch in seconds)
// {{$isoTimestamp}}          - current timestamp (ISO 8601 format)
// {{$randomInt}}             - random integer between 0 and 1000
export function substituteVariables(text: string): string {
  const vars = get(activeVariables);

  // Match {{...}} patterns - can include dots, brackets, and $ prefix
  return text.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
    const trimmed = expression.trim();

    // Handle built-in dynamic variables (start with $)
    if (trimmed.startsWith('$')) {
      return substituteBuiltInVariable(trimmed) ?? match;
    }

    // Handle environment variables (simple word characters)
    if (/^\w+$/.test(trimmed)) {
      return vars.has(trimmed) ? vars.get(trimmed)! : match;
    }

    // If it contains dots but doesn't start with $, treat as environment variable
    // This allows for future expansion but keeps backward compatibility
    return match;
  });
}

/**
 * Handle built-in dynamic variables that start with $
 */
function substituteBuiltInVariable(expression: string): string | undefined {
  // Handle $response.xxx patterns
  if (expression.startsWith('$response.')) {
    const path = expression.substring('$response.'.length);
    const value = getResponseValue(path);

    if (value === undefined) {
      return undefined; // Keep the original placeholder
    }

    // Convert value to string for substitution, stripping HTML tags for defense-in-depth
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value).replace(/<[^>]*>/g, '');
  }

  // Handle other built-in variables
  switch (expression) {
    case '$guid':
    case '$uuid':
      return generateUUID();

    case '$timestamp':
      return Math.floor(Date.now() / 1000).toString();

    case '$isoTimestamp':
      return new Date().toISOString();

    case '$randomInt':
      return Math.floor(Math.random() * 1001).toString();

    default:
      return undefined;
  }
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available, otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback implementation
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
