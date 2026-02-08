import { ScriptEngine } from './ScriptEngine';

describe('ScriptEngine', () => {
  let engine: ScriptEngine;

  const defaultEnv = {
    variables: { apiKey: 'test-key', baseUrl: 'http://localhost:3000' },
    globals: { globalVar: 'global-value' },
  };

  const defaultRequest = {
    url: 'http://localhost:3000/api/test',
    method: 'GET' as const,
    headers: { 'Content-Type': 'application/json' },
    body: null,
  };

  const defaultResponse = {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'abc123', data: [1, 2, 3] }),
    duration: 150,
  };

  beforeEach(() => {
    engine = new ScriptEngine();
  });

  // --- Pre-request Script Tests ---

  describe('Pre-request Scripts', () => {
    it('should execute a simple pre-request script', () => {
      const result = engine.executePreRequestScript(
        'console.log("hello");',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].level).toBe('log');
      expect(result.logs[0].args).toEqual(['hello']);
    });

    it('should modify request headers via setHeader', () => {
      const result = engine.executePreRequestScript(
        "hf.request.setHeader('X-Custom', 'test-value');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.modifiedRequest).toBeDefined();
      expect(result.modifiedRequest!.headers!['X-Custom']).toBe('test-value');
    });

    it('should remove request headers via removeHeader', () => {
      const result = engine.executePreRequestScript(
        "hf.request.removeHeader('Content-Type');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.modifiedRequest).toBeDefined();
      expect(result.modifiedRequest!.headers!['Content-Type']).toBeUndefined();
    });

    it('should modify request URL', () => {
      const result = engine.executePreRequestScript(
        "hf.request.url = 'http://localhost:3000/api/v2/test';",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.modifiedRequest!.url).toBe('http://localhost:3000/api/v2/test');
    });

    it('should read environment variables with getVar', () => {
      const result = engine.executePreRequestScript(
        "console.log(hf.getVar('apiKey'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['test-key']);
    });

    it('should read global variables with getVar', () => {
      const result = engine.executePreRequestScript(
        "console.log(hf.getVar('globalVar'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['global-value']);
    });

    it('should set variables with setVar', () => {
      const result = engine.executePreRequestScript(
        "hf.setVar('newVar', 'newValue');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.variablesToSet).toHaveLength(1);
      expect(result.variablesToSet[0]).toEqual({
        key: 'newVar',
        value: 'newValue',
        scope: 'environment',
      });
    });

    it('should set global variables with scope parameter', () => {
      const result = engine.executePreRequestScript(
        "hf.setVar('globalKey', 'globalVal', 'global');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.variablesToSet[0].scope).toBe('global');
    });

    it('should not have response available in pre-request', () => {
      const result = engine.executePreRequestScript(
        'console.log(typeof hf.response);',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['undefined']);
    });
  });

  // --- Post-response Script Tests ---

  describe('Post-response Scripts', () => {
    it('should execute a simple post-response script', () => {
      const result = engine.executePostResponseScript(
        'console.log("response received");',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['response received']);
    });

    it('should access response status', () => {
      const result = engine.executePostResponseScript(
        'console.log(hf.response.status);',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['200']);
    });

    it('should access response headers', () => {
      const result = engine.executePostResponseScript(
        "console.log(hf.response.headers['content-type']);",
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['application/json']);
    });

    it('should parse response body as JSON', () => {
      const result = engine.executePostResponseScript(
        'const body = hf.response.json(); console.log(body.token);',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['abc123']);
    });

    it('should get response as text', () => {
      const result = engine.executePostResponseScript(
        'console.log(typeof hf.response.text());',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['string']);
    });

    it('should access response duration', () => {
      const result = engine.executePostResponseScript(
        'console.log(hf.response.duration);',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['150']);
    });
  });

  // --- Test Assertions ---

  describe('Test Assertions (hf.test)', () => {
    it('should register a passing test', () => {
      const result = engine.executePostResponseScript(
        "hf.test('status is 200', () => { if (hf.response.status !== 200) throw new Error('not 200'); });",
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.testResults).toHaveLength(1);
      expect(result.testResults[0].name).toBe('status is 200');
      expect(result.testResults[0].passed).toBe(true);
    });

    it('should register a failing test', () => {
      const result = engine.executePostResponseScript(
        "hf.test('status is 404', () => { if (hf.response.status !== 404) throw new Error('expected 404'); });",
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.testResults).toHaveLength(1);
      expect(result.testResults[0].passed).toBe(false);
      expect(result.testResults[0].error).toBe('expected 404');
    });

    it('should run multiple tests', () => {
      const result = engine.executePostResponseScript(
        `
        hf.test('has token', () => {
          const body = hf.response.json();
          if (!body.token) throw new Error('no token');
        });
        hf.test('has data', () => {
          const body = hf.response.json();
          if (!Array.isArray(body.data)) throw new Error('data not array');
        });
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.testResults).toHaveLength(2);
      expect(result.testResults.every(t => t.passed)).toBe(true);
    });
  });

  // --- Utility Functions ---

  describe('Utility Functions', () => {
    it('should generate UUIDs', () => {
      const result = engine.executePreRequestScript(
        'console.log(hf.uuid());',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should hash with MD5', () => {
      const result = engine.executePreRequestScript(
        "console.log(hf.hash.md5('hello'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('should hash with SHA256', () => {
      const result = engine.executePreRequestScript(
        "console.log(hf.hash.sha256('hello'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      );
    });

    it('should encode/decode base64', () => {
      const result = engine.executePreRequestScript(
        `
        const encoded = hf.base64.encode('hello world');
        const decoded = hf.base64.decode(encoded);
        console.log(encoded);
        console.log(decoded);
        `,
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe('aGVsbG8gd29ybGQ=');
      expect(result.logs[1].args[0]).toBe('hello world');
    });
  });

  // --- Console Logging ---

  describe('Console Logging', () => {
    it('should capture console.log', () => {
      const result = engine.executePreRequestScript(
        "console.log('test', 123);",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('log');
      expect(result.logs[0].args).toEqual(['test', '123']);
    });

    it('should capture console.warn', () => {
      const result = engine.executePreRequestScript(
        "console.warn('warning!');",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('warn');
    });

    it('should capture console.error', () => {
      const result = engine.executePreRequestScript(
        "console.error('error!');",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('error');
    });

    it('should capture console.info', () => {
      const result = engine.executePreRequestScript(
        "console.info('info');",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('info');
    });
  });

  // --- Security ---

  describe('Security Sandbox', () => {
    it('should not allow require', () => {
      const result = engine.executePreRequestScript(
        "const fs = require('fs');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('require is not defined');
    });

    it('should not allow process access', () => {
      const result = engine.executePreRequestScript(
        'console.log(process.env);',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('process is not defined');
    });

    it('should handle script errors gracefully', () => {
      const result = engine.executePreRequestScript(
        'throw new Error("script error");',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('script error');
    });

    it('should handle syntax errors', () => {
      const result = engine.executePreRequestScript(
        'invalid javascript code !!@#$',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should track duration', () => {
      const result = engine.executePreRequestScript(
        'let x = 1 + 1;',
        defaultRequest,
        defaultEnv
      );
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });
});
