import { writable, derived, get } from 'svelte/store';
import type { EnvironmentVariable as CoreEnvironmentVariable } from '@hivefetch/core';
import { postMessage } from '../lib/vscode';
import { getResponseValue, getResponseValueByName } from './responseContext';

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

// Derived store for the active environment
export const activeEnvironment = derived(
  [environments, activeEnvironmentId],
  ([$environments, $activeId]) => {
    if (!$activeId) return null;
    return $environments.find((env) => env.id === $activeId) || null;
  }
);

// Derived store for active variables as a map
// Priority chain (lowest → highest): .env file → global → active environment
export const activeVariables = derived(
  [activeEnvironment, globalVariables, envFileVariables],
  ([$env, $globalVars, $envFileVars]) => {
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

// Derived store for variable list with secret info (for UI display)
export interface ActiveVariableEntry {
  key: string;
  value: string;
  isSecret: boolean;
}

export const activeVariablesList = derived(
  [activeEnvironment, globalVariables, envFileVariables],
  ([$env, $globalVars, $envFileVars]) => {
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
 * by the given variables map. Skips built-in dynamic variables ($guid, etc.)
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

  // Match {{...}} patterns
  return text.replace(/\{\{([^}]+)\}\}/g, (match, expression) => {
    const trimmed = expression.trim();

    // Named request references
    const namedRefMatch = trimmed.match(/^(.+?)\.\$response\.(.+)$/);
    if (namedRefMatch) {
      const [, reqName, responsePath] = namedRefMatch;
      const value = getResponseValueByName(reqName, responsePath);
      if (value !== undefined) {
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      return match;
    }

    // Built-in dynamic variables
    if (trimmed.startsWith('$')) {
      return substituteBuiltInVariable(trimmed) ?? match;
    }

    // Environment/scoped variables
    if (/^\w+$/.test(trimmed)) {
      return mergedVars.has(trimmed) ? mergedVars.get(trimmed)! : match;
    }

    return match;
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

    // Named request references: {{RequestName.$response.body.field}}
    const namedRefMatch = trimmed.match(/^(.+?)\.\$response\.(.+)$/);
    if (namedRefMatch) {
      const [, reqName, responsePath] = namedRefMatch;
      const value = getResponseValueByName(reqName, responsePath);
      if (value !== undefined) {
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      return match;
    }

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
  // Handle $response.xxx patterns BEFORE comma-splitting (response paths contain dots, not commas)
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

  // Parse parameters: {{$number, 1, 100}} → varName='$number', args=['1','100']
  const parts = expression.split(',').map((s: string) => s.trim());
  const varName = parts[0];
  const args = parts.slice(1);

  switch (varName) {
    case '$guid':
    case '$uuid':
      return generateUUID();

    case '$timestamp':
      return Math.floor(Date.now() / 1000).toString();

    case '$isoTimestamp':
      return new Date().toISOString();

    case '$randomInt':
      return Math.floor(Math.random() * 1001).toString();

    case '$name':
      return generateRandomName();

    case '$email':
      return generateRandomEmail();

    case '$string': {
      const len = args[0] ? parseInt(args[0], 10) : 16;
      return generateRandomString(isNaN(len) ? 16 : len);
    }

    case '$number': {
      let min = args[0] !== undefined ? Number(args[0]) : 0;
      let max = args[1] !== undefined ? Number(args[1]) : 1000;
      if (isNaN(min) || isNaN(max)) { min = 0; max = 1000; }
      return generateRandomNumber(min, max).toString();
    }

    case '$bool':
      return Math.random() < 0.5 ? 'true' : 'false';

    case '$enum': {
      if (args.length === 0) return undefined;
      return args[Math.floor(Math.random() * args.length)];
    }

    case '$date': {
      const format = args[0] || 'YYYY-MM-DDTHH:mm:ss';
      return formatDate(new Date(), format);
    }

    case '$dateISO':
      return new Date().toISOString();

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

// ============================================
// Dynamic Variable Helpers
// ============================================

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
];

function generateRandomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

function generateRandomEmail(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)].toLowerCase();
  const last = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)].toLowerCase();
  const suffix = Math.floor(Math.random() * 1000);
  const domains = ['example.com', 'test.com', 'example.org'];
  const domain = domains[Math.floor(Math.random() * domains.length)];
  return `${first}.${last}${suffix}@${domain}`;
}

function generateRandomString(length: number): string {
  const clamped = Math.max(1, Math.min(256, length));
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < clamped; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

function generateRandomNumber(min: number, max: number): number {
  // Swap if min > max
  if (min > max) { [min, max] = [max, min]; }
  // If both are integers, return integer; otherwise return 2-decimal float
  if (Number.isInteger(min) && Number.isInteger(max)) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function formatDate(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    'YYYY': date.getFullYear().toString(),
    'MM': String(date.getMonth() + 1).padStart(2, '0'),
    'DD': String(date.getDate()).padStart(2, '0'),
    'HH': String(date.getHours()).padStart(2, '0'),
    'mm': String(date.getMinutes()).padStart(2, '0'),
    'ss': String(date.getSeconds()).padStart(2, '0'),
  };
  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.replace(token, value);
  }
  return result;
}
