import type { EnvironmentVariable as CoreEnvironmentVariable, Collection, CollectionItem, Folder } from '@nouto/core';
import { resolveDynamicVariable, isFolder, generateId } from '@nouto/core';
import { postMessage } from '../lib/vscode';
import { getResponseValue, getResponseValueByName } from './responseContext.svelte';
import { activeCookiesList } from './cookieJar.svelte';

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

// Private state
const _environments = $state<{ value: Environment[] }>({ value: [] });
const _globalVariables = $state<{ value: EnvironmentVariable[] }>({ value: [] });
const _activeEnvironmentId = $state<{ value: string | null }>({ value: null });
const _envFileVariables = $state<{ value: EnvironmentVariable[] }>({ value: [] });
const _envFilePath = $state<{ value: string | null }>({ value: null });
const _collectionScopedVariables = $state<{ value: EnvironmentVariable[] }>({ value: [] });
const _collectionScopedHeaders = $state<{ value: { key: string; value: string; enabled: boolean }[] }>({ value: [] });

export interface InheritedScriptEntry {
  level: string;
  preRequest: string;
  postResponse: string;
}
const _collectionScopedScripts = $state<{ value: InheritedScriptEntry[] }>({ value: [] });

// Getter functions
export function environments() { return _environments.value; }
export function globalVariables() { return _globalVariables.value; }
export function activeEnvironmentId() { return _activeEnvironmentId.value; }
export function envFileVariables() { return _envFileVariables.value; }
export function envFilePath() { return _envFilePath.value; }
export function collectionScopedVariables() { return _collectionScopedVariables.value; }
export function collectionScopedHeaders() { return _collectionScopedHeaders.value; }
export function collectionScopedScripts() { return _collectionScopedScripts.value; }

// Direct setters (for tests and internal use)
export function setEnvironments(envs: Environment[]) { _environments.value = envs; }
export function setGlobalVariables(vars: EnvironmentVariable[]) { _globalVariables.value = vars; }
export function setActiveEnvironmentId(id: string | null) { _activeEnvironmentId.value = id; }
export function setEnvFileVariables(vars: EnvironmentVariable[]) { _envFileVariables.value = vars; }
export function setEnvFilePath(path: string | null) { _envFilePath.value = path; }
export function setCollectionScopedVariables(vars: EnvironmentVariable[]) { _collectionScopedVariables.value = vars; }
export function setCollectionScopedHeaders(headers: { key: string; value: string; enabled: boolean }[]) { _collectionScopedHeaders.value = headers; }
export function setCollectionScopedScripts(scripts: InheritedScriptEntry[]) { _collectionScopedScripts.value = scripts; }

// Derived getter for the active environment
export function activeEnvironment(): Environment | null {
  const id = _activeEnvironmentId.value;
  if (!id) return null;
  return _environments.value.find((env) => env.id === id) || null;
}

// Derived getter for active variables as a map
// Priority chain (lowest to highest): .env file, global, collection/folder, active environment
export function activeVariables(): Map<string, string> {
  const env = activeEnvironment();
  const map = new Map<string, string>();

  // First add .env file variables (lowest priority, overridden by everything)
  for (const v of _envFileVariables.value) {
    if (v.enabled && v.key) {
      map.set(v.key, v.value);
    }
  }

  // Then add global variables (override .env)
  for (const v of _globalVariables.value) {
    if (v.enabled && v.key) {
      map.set(v.key, v.value);
    }
  }

  // Then add collection/folder scoped variables (override global)
  for (const v of _collectionScopedVariables.value) {
    if (v.enabled && v.key) {
      map.set(v.key, v.value);
    }
  }

  // Then add environment variables (override collection/folder)
  if (env) {
    for (const v of env.variables) {
      if (v.enabled && v.key) {
        map.set(v.key, v.value);
      }
    }
  }

  return map;
}

/**
 * Update collection/folder scoped variables and headers for the current request.
 * Resolves from the collection hierarchy (collection -> parent folders).
 * Call this when a request is loaded from a collection or when collections change.
 */
export function updateCollectionScopedVariables(
  collections: Collection[],
  collectionId: string | null,
  requestId: string | null
): void {
  if (!collectionId || !requestId) {
    _collectionScopedVariables.value = [];
    _collectionScopedHeaders.value = [];
    _collectionScopedScripts.value = [];
    return;
  }

  const collection = collections.find(c => c.id === collectionId);
  if (!collection) {
    _collectionScopedVariables.value = [];
    _collectionScopedHeaders.value = [];
    _collectionScopedScripts.value = [];
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

  // Merge headers: collection first, then folders top-to-bottom (child overrides parent by key)
  const headerMap = new Map<string, { key: string; value: string; enabled: boolean }>();
  if (collection.headers) {
    for (const h of collection.headers) {
      if (h.key) headerMap.set(h.key.toLowerCase(), h);
    }
  }

  if (folderPath) {
    for (const folder of folderPath) {
      if (folder.variables) {
        for (const v of folder.variables) {
          if (v.enabled && v.key) varMap.set(v.key, v);
        }
      }
      if (folder.headers) {
        for (const h of folder.headers) {
          if (h.key) headerMap.set(h.key.toLowerCase(), h);
        }
      }
    }
  }

  // Collect inherited scripts: collection first, then folders top-to-bottom
  const inheritedScripts: InheritedScriptEntry[] = [];
  if (collection.scripts?.preRequest?.trim() || collection.scripts?.postResponse?.trim()) {
    inheritedScripts.push({
      level: collection.name,
      preRequest: collection.scripts.preRequest || '',
      postResponse: collection.scripts.postResponse || '',
    });
  }
  if (folderPath) {
    for (const folder of folderPath) {
      if (folder.scripts?.preRequest?.trim() || folder.scripts?.postResponse?.trim()) {
        inheritedScripts.push({
          level: folder.name,
          preRequest: folder.scripts.preRequest || '',
          postResponse: folder.scripts.postResponse || '',
        });
      }
    }
  }

  _collectionScopedVariables.value = Array.from(varMap.values());
  _collectionScopedHeaders.value = Array.from(headerMap.values());
  _collectionScopedScripts.value = inheritedScripts;
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

/**
 * Build scoped variables and headers for a specific request within a collection.
 * Useful for resolving variables/headers when the request is not the currently active one
 * (e.g., right-click "Copy as cURL" from the sidebar).
 */
export function getScopedContextForRequest(
  allCollections: Collection[],
  collectionId: string,
  requestId: string
): { variables: Map<string, string>; headers: { key: string; value: string; enabled: boolean }[] } {
  const empty = { variables: new Map<string, string>(), headers: [] };
  const collection = allCollections.find(c => c.id === collectionId);
  if (!collection) return empty;

  const varMap = new Map<string, string>();
  const headerMap = new Map<string, { key: string; value: string; enabled: boolean }>();

  // Collection-level
  if (collection.variables) {
    for (const v of collection.variables) {
      if (v.enabled && v.key) varMap.set(v.key, v.value);
    }
  }
  if (collection.headers) {
    for (const h of collection.headers) {
      if (h.key) headerMap.set(h.key.toLowerCase(), h);
    }
  }

  // Folder-level (ancestor chain, child overrides parent)
  const folderPath = findAncestorPath(collection.items, requestId);
  if (folderPath) {
    for (const folder of folderPath) {
      if (folder.variables) {
        for (const v of folder.variables) {
          if (v.enabled && v.key) varMap.set(v.key, v.value);
        }
      }
      if (folder.headers) {
        for (const h of folder.headers) {
          if (h.key) headerMap.set(h.key.toLowerCase(), h);
        }
      }
    }
  }

  return { variables: varMap, headers: Array.from(headerMap.values()) };
}

// Derived getter for variable list with secret info (for UI display)
export interface ActiveVariableEntry {
  key: string;
  value: string;
  isSecret: boolean;
}

export function activeVariablesList(): ActiveVariableEntry[] {
  const env = activeEnvironment();
  const map = new Map<string, ActiveVariableEntry>();

  for (const v of _envFileVariables.value) {
    if (v.enabled && v.key) {
      map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
    }
  }
  for (const v of _globalVariables.value) {
    if (v.enabled && v.key) {
      map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
    }
  }
  for (const v of _collectionScopedVariables.value) {
    if (v.enabled && v.key) {
      map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
    }
  }
  if (env) {
    for (const v of env.variables) {
      if (v.enabled && v.key) {
        map.set(v.key, { key: v.key, value: v.value, isSecret: !!v.isSecret });
      }
    }
  }

  return Array.from(map.values());
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
  const currentEnvs = _environments.value;
  const uniqueName = getUniqueEnvName(name, currentEnvs);
  const env: Environment = {
    id: generateId(),
    name: uniqueName,
    variables: [],
  };
  _environments.value = [..._environments.value, env];
  saveEnvironments();
  return env;
}

export function deleteEnvironment(id: string) {
  _environments.value = _environments.value.filter((e) => e.id !== id);
  if (_activeEnvironmentId.value === id) {
    _activeEnvironmentId.value = null;
  }
  saveEnvironments();
}

export function renameEnvironment(id: string, name: string) {
  const currentEnvs = _environments.value;
  const uniqueName = getUniqueEnvName(name, currentEnvs, id);
  _environments.value = _environments.value.map((e) =>
    e.id === id ? { ...e, name: uniqueName } : e
  );
  saveEnvironments();
}

export function setActiveEnvironment(id: string | null) {
  _activeEnvironmentId.value = id;
  saveEnvironments();
}

export function updateEnvironmentVariables(id: string, variables: EnvironmentVariable[]) {
  const filtered = filterEmptyKeys(variables);
  _environments.value = _environments.value.map((e) =>
    e.id === id ? { ...e, variables: filtered } : e
  );
  saveEnvironments();
}

export function duplicateEnvironment(id: string): Environment | null {
  const envs = _environments.value;
  const source = envs.find((e) => e.id === id);
  if (!source) return null;

  const duplicated: Environment = {
    id: generateId(),
    name: getUniqueEnvName(`${source.name} (Copy)`, envs),
    variables: source.variables.map((v) => ({ ...v })),
    color: source.color,
  };
  _environments.value = [..._environments.value, duplicated];
  saveEnvironments();
  return duplicated;
}

export function updateEnvironmentColor(id: string, color: string | undefined) {
  _environments.value = _environments.value.map((e) =>
    e.id === id ? { ...e, color } : e
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
  const currentEnvs = _environments.value;
  const uniqueName = updates.name
    ? getUniqueEnvName(updates.name, currentEnvs, id)
    : undefined;
  const filtered = updates.variables
    ? filterEmptyKeys(updates.variables)
    : undefined;

  _environments.value = _environments.value.map((e) => {
    if (e.id !== id) return e;
    const updated = { ...e };
    if (uniqueName !== undefined) updated.name = uniqueName;
    if (filtered !== undefined) updated.variables = filtered;
    if ('color' in updates) updated.color = updates.color;
    return updated;
  });
  saveEnvironments();
}

export function updateGlobalVariables(variables: EnvironmentVariable[]) {
  _globalVariables.value = filterEmptyKeys(variables);
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
  _environments.value =
    (data.environments || []).map(env => ({ ...env, variables: ensureIds(env.variables) }));
  _activeEnvironmentId.value = data.activeId;
  _globalVariables.value = ensureIds(data.globalVariables || []);
  if (data.envFilePath !== undefined) {
    _envFilePath.value = data.envFilePath ?? null;
  }
  if (data.envFileVariables) {
    _envFileVariables.value = data.envFileVariables;
  }
}

export function loadEnvFileVariables(data: {
  variables: EnvironmentVariable[];
  filePath: string | null;
}) {
  _envFileVariables.value = data.variables || [];
  _envFilePath.value = data.filePath;
}

function saveEnvironments() {
  const envs = _environments.value;
  const activeId = _activeEnvironmentId.value;
  const globalVars = _globalVariables.value;
  // JSON round-trip to strip Svelte 5 reactive proxies
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
 * Pass the reactive activeVariables() from the component to ensure proper reactivity.
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
  const envFileVars = _envFileVariables.value;
  const globalVars = _globalVariables.value;
  const env = activeEnvironment();

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
export function substituteVariables(text: string): string {
  const vars = activeVariables();
  const pattern = /\{\{([^}]+)\}\}/g;

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
    const cookies = activeCookiesList();
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
