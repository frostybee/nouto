import { ScriptEngine } from './ScriptEngine';
import type { CookieContext, ScriptCookie } from './ScriptEngine';

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
    it('should execute a simple pre-request script', async () => {
      const result = await engine.executePreRequestScript(
        'console.log("hello");',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs).toHaveLength(1);
      expect(result.logs[0].level).toBe('log');
      expect(result.logs[0].args).toEqual(['hello']);
    });

    it('should modify request headers via setHeader', async () => {
      const result = await engine.executePreRequestScript(
        "hf.request.setHeader('X-Custom', 'test-value');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.modifiedRequest).toBeDefined();
      expect(result.modifiedRequest!.headers!['X-Custom']).toBe('test-value');
    });

    it('should remove request headers via removeHeader', async () => {
      const result = await engine.executePreRequestScript(
        "hf.request.removeHeader('Content-Type');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.modifiedRequest).toBeDefined();
      expect(result.modifiedRequest!.headers!['Content-Type']).toBeUndefined();
    });

    it('should modify request URL', async () => {
      const result = await engine.executePreRequestScript(
        "hf.request.url = 'http://localhost:3000/api/v2/test';",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.modifiedRequest!.url).toBe('http://localhost:3000/api/v2/test');
    });

    it('should read environment variables with getVar', async () => {
      const result = await engine.executePreRequestScript(
        "console.log(hf.getVar('apiKey'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['test-key']);
    });

    it('should read global variables with getVar', async () => {
      const result = await engine.executePreRequestScript(
        "console.log(hf.getVar('globalVar'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['global-value']);
    });

    it('should set variables with setVar', async () => {
      const result = await engine.executePreRequestScript(
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

    it('should set global variables with scope parameter', async () => {
      const result = await engine.executePreRequestScript(
        "hf.setVar('globalKey', 'globalVal', 'global');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.variablesToSet[0].scope).toBe('global');
    });

    it('should not have response available in pre-request', async () => {
      const result = await engine.executePreRequestScript(
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
    it('should execute a simple post-response script', async () => {
      const result = await engine.executePostResponseScript(
        'console.log("response received");',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['response received']);
    });

    it('should access response status', async () => {
      const result = await engine.executePostResponseScript(
        'console.log(hf.response.status);',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['200']);
    });

    it('should access response headers', async () => {
      const result = await engine.executePostResponseScript(
        "console.log(hf.response.headers['content-type']);",
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['application/json']);
    });

    it('should parse response body as JSON', async () => {
      const result = await engine.executePostResponseScript(
        'const body = hf.response.json(); console.log(body.token);',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['abc123']);
    });

    it('should get response as text', async () => {
      const result = await engine.executePostResponseScript(
        'console.log(typeof hf.response.text());',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args).toEqual(['string']);
    });

    it('should access response duration', async () => {
      const result = await engine.executePostResponseScript(
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
    it('should register a passing test', async () => {
      const result = await engine.executePostResponseScript(
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

    it('should register a failing test', async () => {
      const result = await engine.executePostResponseScript(
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

    it('should run multiple tests', async () => {
      const result = await engine.executePostResponseScript(
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
    it('should generate UUIDs', async () => {
      const result = await engine.executePreRequestScript(
        'console.log(hf.uuid());',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it('should hash with MD5', async () => {
      const result = await engine.executePreRequestScript(
        "console.log(hf.hash.md5('hello'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe('5d41402abc4b2a76b9719d911017c592');
    });

    it('should hash with SHA256', async () => {
      const result = await engine.executePreRequestScript(
        "console.log(hf.hash.sha256('hello'));",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe(
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
      );
    });

    it('should encode/decode base64', async () => {
      const result = await engine.executePreRequestScript(
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
    it('should capture console.log', async () => {
      const result = await engine.executePreRequestScript(
        "console.log('test', 123);",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('log');
      expect(result.logs[0].args).toEqual(['test', '123']);
    });

    it('should capture console.warn', async () => {
      const result = await engine.executePreRequestScript(
        "console.warn('warning!');",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('warn');
    });

    it('should capture console.error', async () => {
      const result = await engine.executePreRequestScript(
        "console.error('error!');",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('error');
    });

    it('should capture console.info', async () => {
      const result = await engine.executePreRequestScript(
        "console.info('info');",
        defaultRequest,
        defaultEnv
      );
      expect(result.logs[0].level).toBe('info');
    });
  });

  // --- Security ---

  describe('Security Sandbox', () => {
    it('should not allow require', async () => {
      const result = await engine.executePreRequestScript(
        "const fs = require('fs');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/require is not (defined|a function)/);
    });

    it('should not allow process access', async () => {
      const result = await engine.executePreRequestScript(
        'console.log(process.env);',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/process is not defined|Cannot read properties of undefined/);
    });

    it('should handle script errors gracefully', async () => {
      const result = await engine.executePreRequestScript(
        'throw new Error("script error");',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toBe('script error');
    });

    it('should handle syntax errors', async () => {
      const result = await engine.executePreRequestScript(
        'invalid javascript code !!@#$',
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should track duration', async () => {
      const result = await engine.executePreRequestScript(
        'let x = 1 + 1;',
        defaultRequest,
        defaultEnv
      );
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // --- setNextRequest ---

  describe('setNextRequest', () => {
    it('should set nextRequest in post-response script result', async () => {
      const result = await engine.executePostResponseScript(
        "hf.setNextRequest('Login');",
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.nextRequest).toBe('Login');
    });

    it('should set nextRequest in pre-request script result', async () => {
      const result = await engine.executePreRequestScript(
        "hf.setNextRequest('Step2');",
        defaultRequest,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.nextRequest).toBe('Step2');
    });

    it('should use last-one-wins when called multiple times', async () => {
      const result = await engine.executePostResponseScript(
        `
        hf.setNextRequest('First');
        hf.setNextRequest('Second');
        hf.setNextRequest('Third');
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.nextRequest).toBe('Third');
    });

    it('should return undefined nextRequest when not called', async () => {
      const result = await engine.executePostResponseScript(
        'console.log("no jump");',
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.nextRequest).toBeUndefined();
    });

    it('should preserve nextRequest even when script errors after calling it', async () => {
      const result = await engine.executePostResponseScript(
        `
        hf.setNextRequest('Target');
        throw new Error('intentional');
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.nextRequest).toBe('Target');
    });
  });

  // --- hf.cookies.* ---

  describe('Cookie Manipulation (hf.cookies)', () => {
    let cookieStore: ScriptCookie[];
    let cookieCtx: CookieContext;

    beforeEach(() => {
      cookieStore = [
        { name: 'session', value: 'abc123', domain: 'example.com', path: '/' },
        { name: 'theme', value: 'dark', domain: 'example.com', path: '/' },
        { name: 'other', value: 'val', domain: 'other.com', path: '/' },
      ];
      cookieCtx = {
        getAll: jest.fn(async () => [...cookieStore]),
        getCookiesForUrl: jest.fn(async (url: string) => {
          const hostname = new URL(url).hostname;
          return cookieStore.filter(c => c.domain === hostname);
        }),
        setCookie: jest.fn(async (cookie: ScriptCookie) => {
          cookieStore = cookieStore.filter(c => !(c.name === cookie.name && c.domain === cookie.domain));
          cookieStore.push(cookie);
        }),
        deleteCookie: jest.fn(async (domain: string, name: string) => {
          cookieStore = cookieStore.filter(c => !(c.domain === domain && c.name === name));
        }),
        clearAll: jest.fn(async () => { cookieStore = []; }),
      };
      engine = new ScriptEngine();
      engine.setCookieContext(cookieCtx);
    });

    it('should get all cookies with hf.cookies.getAll()', async () => {
      const result = await engine.executePostResponseScript(
        `
        const cookies = await hf.cookies.getAll();
        console.log(JSON.stringify(cookies.length));
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe('3');
    });

    it('should get a cookie by name with hf.cookies.get()', async () => {
      const result = await engine.executePostResponseScript(
        `
        const c = await hf.cookies.get('session');
        console.log(c.value);
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe('abc123');
    });

    it('should return undefined for missing cookie name', async () => {
      const result = await engine.executePostResponseScript(
        `
        const c = await hf.cookies.get('nonexistent');
        console.log(String(c));
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(result.logs[0].args[0]).toBe('undefined');
    });

    it('should get cookies by URL with hf.cookies.getByUrl()', async () => {
      const result = await engine.executePostResponseScript(
        `
        const cookies = await hf.cookies.getByUrl('https://example.com/api');
        console.log(JSON.stringify(cookies.map(c => c.name)));
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(JSON.parse(result.logs[0].args[0])).toEqual(['session', 'theme']);
    });

    it('should set a cookie with hf.cookies.set()', async () => {
      const result = await engine.executePostResponseScript(
        `
        await hf.cookies.set({ name: 'newCookie', value: 'newVal', domain: 'example.com', path: '/' });
        `,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(cookieCtx.setCookie).toHaveBeenCalledWith({
        name: 'newCookie', value: 'newVal', domain: 'example.com', path: '/',
      });
    });

    it('should reject hf.cookies.set() without name/domain', async () => {
      const result = await engine.executePostResponseScript(
        `await hf.cookies.set({ value: 'val' });`,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires at least name and domain');
    });

    it('should delete a cookie with hf.cookies.delete()', async () => {
      const result = await engine.executePostResponseScript(
        `await hf.cookies.delete('example.com', 'session');`,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(cookieCtx.deleteCookie).toHaveBeenCalledWith('example.com', 'session');
    });

    it('should clear all cookies with hf.cookies.clear()', async () => {
      const result = await engine.executePostResponseScript(
        `await hf.cookies.clear();`,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(true);
      expect(cookieCtx.clearAll).toHaveBeenCalled();
    });

    it('should throw helpful error when no cookie context is set', async () => {
      const noCookieEngine = new ScriptEngine();
      const result = await noCookieEngine.executePostResponseScript(
        `await hf.cookies.getAll();`,
        defaultRequest,
        defaultResponse,
        defaultEnv
      );
      expect(result.success).toBe(false);
      expect(result.error).toContain('not available in this context');
    });
  });
});
