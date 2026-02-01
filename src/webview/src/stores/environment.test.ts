import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  environments,
  globalVariables,
  activeEnvironmentId,
  activeEnvironment,
  activeVariables,
  addEnvironment,
  deleteEnvironment,
  renameEnvironment,
  setActiveEnvironment,
  updateEnvironmentVariables,
  duplicateEnvironment,
  updateGlobalVariables,
  loadEnvironments,
  substituteVariables,
} from './environment';
import type { Environment, EnvironmentVariable } from './environment';
import { vscodeApiMocks } from '../test/setup';

// Mock responseContext module
vi.mock('./responseContext', () => ({
  getResponseValue: vi.fn((path: string) => {
    if (path === 'body.token') return 'mock-token';
    if (path === 'headers.content-type') return 'application/json';
    if (path === 'status') return 200;
    return undefined;
  }),
}));

describe('environment store', () => {
  beforeEach(() => {
    environments.set([]);
    globalVariables.set([]);
    activeEnvironmentId.set(null);
    vscodeApiMocks.postMessage.mockClear();
  });

  describe('addEnvironment', () => {
    it('should create a new environment', () => {
      const env = addEnvironment('Development');

      expect(env.name).toBe('Development');
      expect(env.variables).toEqual([]);
      expect(get(environments)).toHaveLength(1);
    });

    it('should generate unique IDs', () => {
      const env1 = addEnvironment('First');
      const env2 = addEnvironment('Second');

      expect(env1.id).not.toBe(env2.id);
    });

    it('should notify extension to save', () => {
      addEnvironment('Test');

      expect(vscodeApiMocks.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'saveEnvironments',
        })
      );
    });
  });

  describe('deleteEnvironment', () => {
    it('should remove an environment', () => {
      const env = addEnvironment('ToDelete');
      vscodeApiMocks.postMessage.mockClear();

      deleteEnvironment(env.id);

      expect(get(environments)).toHaveLength(0);
    });

    it('should clear active environment if deleted', () => {
      const env = addEnvironment('Active');
      setActiveEnvironment(env.id);

      deleteEnvironment(env.id);

      expect(get(activeEnvironmentId)).toBeNull();
    });

    it('should not affect active environment if different env deleted', () => {
      const env1 = addEnvironment('Keep');
      const env2 = addEnvironment('Delete');
      setActiveEnvironment(env1.id);

      deleteEnvironment(env2.id);

      expect(get(activeEnvironmentId)).toBe(env1.id);
    });
  });

  describe('renameEnvironment', () => {
    it('should rename an environment', () => {
      const env = addEnvironment('Old Name');

      renameEnvironment(env.id, 'New Name');

      expect(get(environments)[0].name).toBe('New Name');
    });
  });

  describe('setActiveEnvironment', () => {
    it('should set active environment', () => {
      const env = addEnvironment('Test');

      setActiveEnvironment(env.id);

      expect(get(activeEnvironmentId)).toBe(env.id);
    });

    it('should allow setting to null', () => {
      const env = addEnvironment('Test');
      setActiveEnvironment(env.id);

      setActiveEnvironment(null);

      expect(get(activeEnvironmentId)).toBeNull();
    });
  });

  describe('updateEnvironmentVariables', () => {
    it('should update environment variables', () => {
      const env = addEnvironment('Test');
      const variables: EnvironmentVariable[] = [
        { key: 'API_KEY', value: 'secret-key', enabled: true },
        { key: 'BASE_URL', value: 'https://api.test.com', enabled: true },
      ];

      updateEnvironmentVariables(env.id, variables);

      expect(get(environments)[0].variables).toEqual(variables);
    });
  });

  describe('duplicateEnvironment', () => {
    it('should create a copy of an environment', () => {
      const env = addEnvironment('Original');
      updateEnvironmentVariables(env.id, [
        { key: 'VAR1', value: 'value1', enabled: true },
      ]);

      const copy = duplicateEnvironment(env.id);

      expect(copy).not.toBeNull();
      expect(copy?.name).toBe('Original (Copy)');
      expect(copy?.variables).toEqual(get(environments)[0].variables);
      expect(copy?.id).not.toBe(env.id);
    });

    it('should return null for non-existent environment', () => {
      const result = duplicateEnvironment('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateGlobalVariables', () => {
    it('should update global variables', () => {
      const vars: EnvironmentVariable[] = [
        { key: 'GLOBAL_VAR', value: 'global-value', enabled: true },
      ];

      updateGlobalVariables(vars);

      expect(get(globalVariables)).toEqual(vars);
    });
  });

  describe('loadEnvironments', () => {
    it('should load all environment data', () => {
      const data = {
        environments: [
          { id: 'env-1', name: 'Dev', variables: [] },
          { id: 'env-2', name: 'Prod', variables: [] },
        ],
        activeId: 'env-1',
        globalVariables: [{ key: 'GLOBAL', value: 'val', enabled: true }],
      };

      loadEnvironments(data);

      expect(get(environments)).toHaveLength(2);
      expect(get(activeEnvironmentId)).toBe('env-1');
      expect(get(globalVariables)).toHaveLength(1);
    });

    it('should handle missing globalVariables', () => {
      loadEnvironments({
        environments: [],
        activeId: null,
      });

      expect(get(globalVariables)).toEqual([]);
    });
  });

  describe('derived stores', () => {
    describe('activeEnvironment', () => {
      it('should return the active environment', () => {
        const env = addEnvironment('Active');
        setActiveEnvironment(env.id);

        expect(get(activeEnvironment)).toEqual(env);
      });

      it('should return null when no active environment', () => {
        addEnvironment('Inactive');

        expect(get(activeEnvironment)).toBeNull();
      });
    });

    describe('activeVariables', () => {
      it('should merge global and environment variables', () => {
        updateGlobalVariables([
          { key: 'GLOBAL', value: 'global-val', enabled: true },
        ]);
        const env = addEnvironment('Test');
        updateEnvironmentVariables(env.id, [
          { key: 'LOCAL', value: 'local-val', enabled: true },
        ]);
        setActiveEnvironment(env.id);

        const vars = get(activeVariables);

        expect(vars.get('GLOBAL')).toBe('global-val');
        expect(vars.get('LOCAL')).toBe('local-val');
      });

      it('should allow environment to override global variables', () => {
        updateGlobalVariables([
          { key: 'URL', value: 'global-url', enabled: true },
        ]);
        const env = addEnvironment('Test');
        updateEnvironmentVariables(env.id, [
          { key: 'URL', value: 'env-url', enabled: true },
        ]);
        setActiveEnvironment(env.id);

        const vars = get(activeVariables);

        expect(vars.get('URL')).toBe('env-url');
      });

      it('should exclude disabled variables', () => {
        updateGlobalVariables([
          { key: 'ENABLED', value: 'yes', enabled: true },
          { key: 'DISABLED', value: 'no', enabled: false },
        ]);

        const vars = get(activeVariables);

        expect(vars.has('ENABLED')).toBe(true);
        expect(vars.has('DISABLED')).toBe(false);
      });

      it('should exclude empty keys', () => {
        updateGlobalVariables([
          { key: '', value: 'empty-key', enabled: true },
        ]);

        const vars = get(activeVariables);

        expect(vars.has('')).toBe(false);
      });
    });
  });

  describe('substituteVariables', () => {
    beforeEach(() => {
      updateGlobalVariables([
        { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
        { key: 'apiKey', value: 'secret-123', enabled: true },
      ]);
    });

    it('should substitute environment variables', () => {
      const result = substituteVariables('{{baseUrl}}/users');

      expect(result).toBe('https://api.example.com/users');
    });

    it('should substitute multiple variables', () => {
      const result = substituteVariables('{{baseUrl}}?key={{apiKey}}');

      expect(result).toBe('https://api.example.com?key=secret-123');
    });

    it('should leave unknown variables unchanged', () => {
      const result = substituteVariables('{{unknown}}');

      expect(result).toBe('{{unknown}}');
    });

    it('should handle $guid variable', () => {
      const result = substituteVariables('{{$guid}}');

      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should handle $uuid variable (alias for $guid)', () => {
      const result = substituteVariables('{{$uuid}}');

      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should handle $timestamp variable', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = substituteVariables('{{$timestamp}}');
      const after = Math.floor(Date.now() / 1000);

      const timestamp = parseInt(result, 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle $isoTimestamp variable', () => {
      const result = substituteVariables('{{$isoTimestamp}}');

      expect(() => new Date(result)).not.toThrow();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle $randomInt variable', () => {
      const result = substituteVariables('{{$randomInt}}');

      const num = parseInt(result, 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(1000);
    });

    it('should handle $response.body path', () => {
      const result = substituteVariables('Bearer {{$response.body.token}}');

      expect(result).toBe('Bearer mock-token');
    });

    it('should handle $response.headers path', () => {
      const result = substituteVariables('Type: {{$response.headers.content-type}}');

      expect(result).toBe('Type: application/json');
    });

    it('should handle $response.status', () => {
      const result = substituteVariables('Status: {{$response.status}}');

      expect(result).toBe('Status: 200');
    });

    it('should leave $response placeholder when value not found', () => {
      const result = substituteVariables('{{$response.body.missing}}');

      expect(result).toBe('{{$response.body.missing}}');
    });

    it('should handle whitespace in variable names', () => {
      const result = substituteVariables('{{ baseUrl }}');

      expect(result).toBe('https://api.example.com');
    });

    it('should not substitute text without braces', () => {
      const result = substituteVariables('baseUrl');

      expect(result).toBe('baseUrl');
    });

    it('should handle empty string', () => {
      const result = substituteVariables('');

      expect(result).toBe('');
    });
  });
});
