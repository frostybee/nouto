import { writable, derived, get } from 'svelte/store';
import type { EnvironmentVariable as CoreEnvironmentVariable, Collection, CollectionItem, Folder } from '@hivefetch/core';
import { resolveDynamicVariable, isFolder } from '@hivefetch/core';
import { postMessage } from '../lib/vscode';
import { getResponseValue, getResponseValueByName } from './responseContext';
import { activeCookiesList } from './cookieJar';

export interface EnvironmentVariable extends CoreEnvironmentVariable {
  id?: string;
}

export interface Environment {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
  isGlobal?: boolean;
  color?: string;
}

// Store for all environments
export const environments = writable<Environment[]>([]);

// Global variables store (always active)
export const globalVariables = writable<EnvironmentVariable[]>([]);

// Currently active environment ID
export const activeEnvironmentId = writable<string | null>(null);

// .env file stores
export const envFileVariables = writable<EnvironmentVariable[]>([]);
export const envFilePath = writable<string | null>(null);

// Collection/folder scoped variables (set when a request is loaded from a collection)
export const collectionScopedVariables = writable<EnvironmentVariable[]>([]);

// Derived store for the active environment
export const activeEnvironment = derived(
  [environments, activeEnvironmentId],
  ([$environments, $activeId]) => {
    if (!$activeId) return null;
    return $environments.find((env) => env.id === $activeId) || null;
  }
);

// Derived store for active variables as a map
// Priority chain (lowest → highest): .env file → global → collection/folder → active environment
export const activeVariables = derived(
  [activeEnvironment, globalVariables, envFileVariables, collectionScopedVariables],
  ([$env, $globalVars, $envFileVars, $scopedVars]) => {
    const map = new Map<string, string>();

    // First add .env file variables (lowest priority, overridden by everything)
    for (const v of $envFileVars) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value);
      }
    }

    // Then add global variables (override .env)
    for (const v of $globalVars) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value);
      }
    }

    // Then add collection/folder scoped variables (override global)
    for (const v of $scopedVars) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value);
      }
    }

    // Then add environment variables (override collection/folder)
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

/**
 * Update collection/folder scoped variables for the current request.
 * Resolves variables from the collection hierarchy (collection -> parent folders).
 * Call this when a request is loaded from a collection or when collections change.
 */
export function updateCollectionScopedVariables(
  collections: Collection[],
  collectionId: string | null,
  requestId: string | null
): void {
  if (!collectionId || !requestId) {
    collectionScopedVariables.set([]);
    return;
  }

  const collection = collections.find(c => c.id === collectionId);
  if (!collection) {
    collectionScopedVariables.set([]);
    return;
  }

  // Build ancestor path from collection root to the request
  const folderPath = findAncestorPath(collection.items, requestId);
  // Merge variables: collection first, then folders top-to-bottom (child overrides parent)
  const varMap = new Map<string, CoreEnvironmentVariable>();
  if (collection.variables) {
    for (const v of collection.variables) {
      if (v.enabled && v.key) varMap.set(v.key, v);
    }
  }
  if (folderPath) {
    for (const folder of folderPath) {
      if (folder.variables) {
        for (const v of folder.variables) {
          if (v.enabled && v.key) varMap.set(v.key, v);
        }
      }
    }
  }
  collectionScopedVariables.set(Array.from(varMap.values()));
}

/** Recursively find the chain of ancestor folders leading to the target item. */
function findAncestorPath(items: CollectionItem[], targetId: string): Folder[] | null {
  for (const item of items) {
    if (item.id === targetId) return [];
    if (isFolder(item)) {
      const result = findAncestorPath(item.children, targetId);
      if (result) return [item, ...result];
    }
  }
  return null;
}

// Derived store for variable list with secret info (for UI display)
export interface ActiveVariableEntry {
  key: string;
  value: string;
  isSecret: boolean;
}

export const activeVariablesList = derived(
  [activeEnvironment, globalVariables, envFileVariables, collectionScopedVariables],
  ([$env, $globalVars, $envFileVars, $scopedVars]) => {
    const map = new Map<string, ActiveVariableEntry>();

    for (const v of $envFileVars) {
      if (v.enabled && v.key) {
        map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
      }
    }
    for (const v of $globalVars) {
      if (v.enabled && v.key) {
        map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
      }
    }
    for (const v of $scopedVars) {
      if (v.enabled && v.key) {
        map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
      }
    }
    if ($env) {
      for (const v of $env.variables) {
        if (v.enabled && v.key) {
          map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
        }
      }
    }

    return Array.from(map.values());
  }
);

// Helper to generate unique ID
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Ensure environment names are unique by auto-suffixing duplicates
function getUniqueEnvName(baseName: string, currentEnvs: Environment[], excludeId?: string): string {
  const names = new Set(currentEnvs.filter(e => e.id !== excludeId).map(e => e.name));
  if (!names.has(baseName)) return baseName;
  let counter = 2;
  while (names.has(`${baseName} (${counter})`)) {
    counter++;
  }
  return `${baseName} (${counter})`;
}

// Filter out variables with empty/whitespace-only keys before persisting
function filterEmptyKeys(variables: EnvironmentVariable[]): EnvironmentVariable[] {
  return variables.filter(v => v.key.trim() !== '');
}

// Environment management functions
export function addEnvironment(name: string): Environment {
  const currentEnvs = get(environments);
  const uniqueName = getUniqueEnvName(name, currentEnvs);
  const env: Environment = {
    id: generateId(),
    name: uniqueName,
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
  const currentEnvs = get(environments);
  const uniqueName = getUniqueEnvName(name, currentEnvs, id);
  environments.update((envs) =>
    envs.map((e) => (e.id === id ? { ...e, name: uniqueName } : e))
  );
  saveEnvironments();
}

export function setActiveEnvironment(id: string | null) {
  activeEnvironmentId.set(id);
  saveEnvironments();
}

export function updateEnvironmentVariables(id: string, variables: EnvironmentVariable[]) {
  const filtered = filterEmptyKeys(variables);
  environments.update((envs) =>
    envs.map((e) => (e.id === id ? { ...e, variables: filtered } : e))
  );
  saveEnvironments();
}

export function duplicateEnvironment(id: string): Environment | null {
  const envs = get(environments);
  const source = envs.find((e) => e.id === id);
  if (!source) return null;

  const duplicated: Environment = {
    id: generateId(),
    name: getUniqueEnvName(`${source.name} (Copy)`, envs),
    variables: source.variables.map((v) => ({ ...v })),
    color: source.color,
  };
  environments.update((envs) => [...envs, duplicated]);
  saveEnvironments();
  return duplicated;
}

export function updateEnvironmentColor(id: string, color: string | undefined) {
  environments.update((envs) =>
    envs.map((e) => (e.id === id ? { ...e, color } : e))
  );
  saveEnvironments();
}

/**
 * Batch-update an environment's name, variables, and color in a single save.
 * Avoids multiple saveEnvironments() calls that trigger redundant broadcasts.
 */
export function updateEnvironmentBatch(
  id: string,
  updates: { name?: string; variables?: EnvironmentVariable[]; color?: string | undefined }
) {
  const currentEnvs = get(environments);
  const uniqueName = updates.name
    ? getUniqueEnvName(updates.name, currentEnvs, id)
    : undefined;
  const filtered = updates.variables
    ? filterEmptyKeys(updates.variables)
    : undefined;

  environments.update((envs) =>
    envs.map((e) => {
      if (e.id !== id) return e;
      const updated = { ...e };
      if (uniqueName !== undefined) updated.name = uniqueName;
      if (filtered !== undefined) updated.variables = filtered;
      if ('color' in updates) updated.color = updates.color;
      return updated;
    })
  );
  saveEnvironments();
}

export function updateGlobalVariables(variables: EnvironmentVariable[]) {
  globalVariables.set(filterEmptyKeys(variables));
  saveEnvironments();
}

function ensureIds(vars: EnvironmentVariable[]): EnvironmentVariable[] {
  return vars.map(v => (v.id ? v : { ...v, id: generateId() }));
}

export function loadEnvironments(data: {
  environments: Environment[];
  activeId: string | null;
  globalVariables?: EnvironmentVariable[];
  envFilePath?: string | null;
  envFileVariables?: EnvironmentVariable[];
}) {
  environments.set(
    (data.environments || []).map(env => ({ ...env, variables: ensureIds(env.variables) }))
  );
  activeEnvironmentId.set(data.activeId);
  globalVariables.set(ensureIds(data.globalVariables || []));
  if (data.envFilePath !== undefined) {
    envFilePath.set(data.envFilePath ?? null);
  }
  if (data.envFileVariables) {
    envFileVariables.set(data.envFileVariables);
  }
}

export function loadEnvFileVariables(data: {
  variables: EnvironmentVariable[];
  filePath: string | null;
}) {
  envFileVariables.set(data.variables || []);
  envFilePath.set(data.filePath);
}

function saveEnvironments() {
  const envs = get(environments);
  const activeId = get(activeEnvironmentId);
  const globalVars = get(globalVariables);
  // JSON round-trip to strip Svelte 5 reactive proxies - postMessage requires cloneable data
  const data = JSON.parse(JSON.stringify({ environments: envs, activeId, globalVariables: globalVars }));
  postMessage({
    type: 'saveEnvironments',
    data,
  });
}

/**
 * Find all {{variable}} patterns in text that would NOT be resolved
 * by the given variables map. Skips built-in dynamic variables ($uuid.v4, etc.)
 * and $response references since those resolve at runtime.
 * Pass the reactive $activeVariables from the component to ensure proper reactivity.
 */
export function getUnresolvedVariables(text: string, vars: Map<string, string>): string[] {
  if (!text) return [];
  const unresolved: string[] = [];

  const pattern = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const trimmed = match[1].trim();
    if (trimmed.startsWith('$')) continue;
    if (!/^\w+$/.test(trimmed)) continue;
    if (!vars.has(trimmed)) {
      unresolved.push(trimmed);
    }
  }

  return [...new Set(unresolved)];
}

/**
 * Substitute variables with scope-aware resolution.
 * Priority chain: .env < global < scopedVars (collection/folder) < active environment
 */
export function substituteVariablesWithScope(text: string, scopedVars: Map<string, string>): string {
  const envFileVars = get(envFileVariables);
  const globalVars = get(globalVariables);
  const env = get(activeEnvironment);

  // Build merged variable map with correct priority
  const mergedVars = new Map<string, string>();

  // 1. .env file (lowest priority)
  for (const v of envFileVars) {
    if (v.enabled && v.key) mergedVars.set(v.key, v.value);
  }
  // 2. Global variables
  for (const v of globalVars) {
    if (v.enabled && v.key) mergedVars.set(v.key, v.value);
  }
  // 3. Collection/folder scoped variables
  for (const [k, v] of scopedVars) {
    mergedVars.set(k, v);
  }
  // 4. Active environment (highest priority)
  if (env) {
    for (const v of env.variables) {
      if (v.enabled && v.key) mergedVars.set(v.key, v.value);
    }
  }

  // Multi-pass resolution (same as substituteVariables)
  const pattern = /\{\{([^}]+)\}\}/g;
  let result = text;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    result = result.replace(pattern, (match, expression) => {
      const trimmed = expression.trim();

      // Named request references
      const namedRefMatch = trimmed.match(/^(.+?)\.\$response\.(.+)$/);
      if (namedRefMatch) {
        const [, reqName, responsePath] = namedRefMatch;
        const value = getResponseValueByName(reqName, responsePath);
        if (value !== undefined) {
          const resolved = typeof value === 'object' ? JSON.stringify(value) : String(value);
          if (resolved !== match) changed = true;
          return resolved;
        }
        return match;
      }

      // Built-in dynamic variables
      if (trimmed.startsWith('$')) {
        const resolved = substituteBuiltInVariable(trimmed);
        if (resolved !== undefined) {
          changed = true;
          return resolved;
        }
        return match;
      }

      // Environment/scoped variables
      if (/^\w+$/.test(trimmed)) {
        if (mergedVars.has(trimmed)) {
          const resolved = mergedVars.get(trimmed)!;
          if (resolved !== match) changed = true;
          return resolved;
        }
        return match;
      }

      return match;
    });

    if (!changed) break;
  }

  return result;
}

// Variable substitution function
// Replaces variables with their values
// Supported patterns:
// {{variableName}}           - environment variable
// {{$response.body.token}}   - last response body
// {{$response.headers.auth}} - last response headers
// {{$response.status}}       - last response status
// {{$uuid.v4}}               - generate UUID v4
// {{$timestamp.unix}}        - current timestamp (Unix epoch in seconds)
// {{$timestamp.iso}}         - current timestamp (ISO 8601 format)
// {{$random.int, 0, 1000}}   - random integer in range
export function substituteVariables(text: string): string {
  const vars = get(activeVariables);
  const pattern = /\{\{([^}]+)\}\}/g;

  // Multi-pass resolution: an env var value may itself contain {{$uuid.v4}} or other
  // variable references. Loop until no more substitutions occur (max 5 passes to
  // prevent infinite loops from circular references like a={{b}}, b={{a}}).
  let result = text;
  for (let pass = 0; pass < 5; pass++) {
    let changed = false;
    result = result.replace(pattern, (match, expression) => {
      const trimmed = expression.trim();

      // Named request references: {{RequestName.$response.body.field}}
      const namedRefMatch = trimmed.match(/^(.+?)\.\$response\.(.+)$/);
      if (namedRefMatch) {
        const [, reqName, responsePath] = namedRefMatch;
        const value = getResponseValueByName(reqName, responsePath);
        if (value !== undefined) {
          const resolved = typeof value === 'object' ? JSON.stringify(value) : String(value);
          if (resolved !== match) changed = true;
          return resolved;
        }
        return match;
      }

      // Handle built-in dynamic variables (start with $)
      if (trimmed.startsWith('$')) {
        const resolved = substituteBuiltInVariable(trimmed);
        if (resolved !== undefined) {
          changed = true;
          return resolved;
        }
        return match;
      }

      // Handle environment variables (simple word characters)
      if (/^\w+$/.test(trimmed)) {
        if (vars.has(trimmed)) {
          const resolved = vars.get(trimmed)!;
          if (resolved !== match) changed = true;
          return resolved;
        }
        return match;
      }

      // If it contains dots but doesn't start with $, treat as environment variable
      // This allows for future expansion but keeps backward compatibility
      return match;
    });

    if (!changed) break;
  }

  return result;
}

/**
 * Handle built-in dynamic variables that start with $.
 * Context-dependent variables ($cookie, $response) are handled here with store access.
 * All other dynamic variables delegate to the core resolver.
 */
function substituteBuiltInVariable(expression: string): string | undefined {
  // Handle $cookie.xxx patterns (lookup cookie value from active jar)
  if (expression.startsWith('$cookie.')) {
    const cookieName = expression.substring('$cookie.'.length);
    const cookies = get(activeCookiesList);
    const found = cookies.find((c: any) => c.name === cookieName);
    return found ? found.value : undefined;
  }

  // Handle $response.xxx patterns (requires response context store)
  if (expression.startsWith('$response.')) {
    const path = expression.substring('$response.'.length);
    const value = getResponseValue(path);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value).replace(/<[^>]*>/g, '');
  }

  // All other dynamic variables (flat + namespaced) are handled by core
  return resolveDynamicVariable(expression);
}
