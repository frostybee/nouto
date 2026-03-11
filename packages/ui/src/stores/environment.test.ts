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
  updateCollectionScopedVariables,
  collectionScopedScripts,
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

    it('should handle $uuid.v4 variable', () => {
      const result = substituteVariables('{{$uuid.v4}}');

      expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should handle $timestamp.unix variable', () => {
      const before = Math.floor(Date.now() / 1000);
      const result = substituteVariables('{{$timestamp.unix}}');
      const after = Math.floor(Date.now() / 1000);

      const timestamp = parseInt(result, 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle $timestamp.iso variable', () => {
      const result = substituteVariables('{{$timestamp.iso}}');

      expect(() => new Date(result)).not.toThrow();
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should handle $random.int variable', () => {
      const result = substituteVariables('{{$random.int, 0, 1000}}');

      const num = parseInt(result, 10);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(1000);
    });

    it('should leave removed legacy variables unchanged', () => {
      expect(substituteVariables('{{$guid}}')).toBe('{{$guid}}');
      expect(substituteVariables('{{$randomInt}}')).toBe('{{$randomInt}}');
      expect(substituteVariables('{{$isoTimestamp}}')).toBe('{{$isoTimestamp}}');
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

    // Namespaced dynamic variables
    describe('$random.name', () => {
      it('should generate a first and last name', () => {
        const result = substituteVariables('{{$random.name}}');

        expect(result).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/);
      });
    });

    describe('$random.email', () => {
      it('should generate a valid email format', () => {
        const result = substituteVariables('{{$random.email}}');

        expect(result).toMatch(/^[a-z]+\.[a-z]+\d+@(example\.com|test\.com|example\.org)$/);
      });
    });

    describe('$random.string', () => {
      it('should generate a 16-char string by default', () => {
        const result = substituteVariables('{{$random.string}}');

        expect(result).toHaveLength(16);
        expect(result).toMatch(/^[A-Za-z0-9]+$/);
      });

      it('should generate a string with custom length', () => {
        const result = substituteVariables('{{$random.string, 8}}');

        expect(result).toHaveLength(8);
      });

      it('should clamp negative length to 1', () => {
        const result = substituteVariables('{{$random.string, -5}}');

        expect(result).toHaveLength(1);
      });

      it('should clamp excessive length to 256', () => {
        const result = substituteVariables('{{$random.string, 999}}');

        expect(result).toHaveLength(256);
      });

      it('should default to 16 for non-numeric arg', () => {
        const result = substituteVariables('{{$random.string, abc}}');

        expect(result).toHaveLength(16);
      });
    });

    describe('$random.number', () => {
      it('should generate a number in default range 0-1000', () => {
        const result = substituteVariables('{{$random.number}}');
        const num = Number(result);

        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(1000);
      });

      it('should generate a number in custom range', () => {
        const result = substituteVariables('{{$random.number, 1, 10}}');
        const num = Number(result);

        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(10);
      });

      it('should swap min and max if inverted', () => {
        const result = substituteVariables('{{$random.number, 100, 50}}');
        const num = Number(result);

        expect(num).toBeGreaterThanOrEqual(50);
        expect(num).toBeLessThanOrEqual(100);
      });

      it('should default to 0-1000 for non-numeric args', () => {
        const result = substituteVariables('{{$random.number, abc}}');
        const num = Number(result);

        expect(num).toBeGreaterThanOrEqual(0);
        expect(num).toBeLessThanOrEqual(1000);
      });

      it('should return integer for integer bounds', () => {
        const result = substituteVariables('{{$random.number, 1, 100}}');

        expect(result).toMatch(/^\d+$/);
      });
    });

    describe('$random.bool', () => {
      it('should generate true or false', () => {
        const result = substituteVariables('{{$random.bool}}');

        expect(['true', 'false']).toContain(result);
      });
    });

    describe('$random.enum', () => {
      it('should pick from provided values', () => {
        const result = substituteVariables('{{$random.enum, red, green, blue}}');

        expect(['red', 'green', 'blue']).toContain(result);
      });

      it('should keep placeholder when no args provided', () => {
        const result = substituteVariables('{{$random.enum}}');

        expect(result).toBe('{{$random.enum}}');
      });
    });

    describe('$timestamp.format', () => {
      it('should format with default pattern', () => {
        const result = substituteVariables('{{$timestamp.format}}');

        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
      });

      it('should format with custom pattern', () => {
        const result = substituteVariables('{{$timestamp.format, YYYY-MM-DD}}');

        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });

  describe('updateCollectionScopedVariables - scripts', () => {
    it('should set empty scripts when no collectionId', () => {
      updateCollectionScopedVariables([], null, null);
      expect(get(collectionScopedScripts)).toEqual([]);
    });

    it('should set empty scripts when collection not found', () => {
      updateCollectionScopedVariables([], 'nonexistent', 'r1');
      expect(get(collectionScopedScripts)).toEqual([]);
    });

    it('should collect collection-level scripts', () => {
      const collections = [{
        id: 'c1',
        name: 'My Collection',
        items: [{ type: 'request' as const, id: 'r1', name: 'Req', method: 'GET' as const, url: '', params: [], headers: [], auth: { type: 'none' as const }, body: { type: 'none' as const, content: '' }, createdAt: '', updatedAt: '' }],
        expanded: true,
        scripts: { preRequest: 'console.log("pre");', postResponse: 'console.log("post");' },
        createdAt: '',
        updatedAt: '',
      }];
      updateCollectionScopedVariables(collections as any, 'c1', 'r1');
      const scripts = get(collectionScopedScripts);
      expect(scripts).toHaveLength(1);
      expect(scripts[0].level).toBe('My Collection');
      expect(scripts[0].preRequest).toBe('console.log("pre");');
      expect(scripts[0].postResponse).toBe('console.log("post");');
    });

    it('should collect scripts from collection and folder', () => {
      const collections = [{
        id: 'c1',
        name: 'Col',
        items: [{
          type: 'folder' as const,
          id: 'f1',
          name: 'Folder',
          children: [{ type: 'request' as const, id: 'r1', name: 'Req', method: 'GET' as const, url: '', params: [], headers: [], auth: { type: 'none' as const }, body: { type: 'none' as const, content: '' }, createdAt: '', updatedAt: '' }],
          expanded: true,
          scripts: { preRequest: 'folder pre', postResponse: '' },
          createdAt: '',
          updatedAt: '',
        }],
        expanded: true,
        scripts: { preRequest: 'col pre', postResponse: 'col post' },
        createdAt: '',
        updatedAt: '',
      }];
      updateCollectionScopedVariables(collections as any, 'c1', 'r1');
      const scripts = get(collectionScopedScripts);
      expect(scripts).toHaveLength(2);
      expect(scripts[0].level).toBe('Col');
      expect(scripts[1].level).toBe('Folder');
      expect(scripts[1].preRequest).toBe('folder pre');
    });

    it('should skip levels with only empty/whitespace scripts', () => {
      const collections = [{
        id: 'c1',
        name: 'Col',
        items: [{ type: 'request' as const, id: 'r1', name: 'Req', method: 'GET' as const, url: '', params: [], headers: [], auth: { type: 'none' as const }, body: { type: 'none' as const, content: '' }, createdAt: '', updatedAt: '' }],
        expanded: true,
        scripts: { preRequest: '  ', postResponse: '' },
        createdAt: '',
        updatedAt: '',
      }];
      updateCollectionScopedVariables(collections as any, 'c1', 'r1');
      expect(get(collectionScopedScripts)).toEqual([]);
    });
  });
});
