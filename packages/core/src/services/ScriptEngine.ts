import * as vm from 'vm';
import * as crypto from 'crypto';
import { expect, assert } from 'chai';
import type {
  HttpMethod,
  ScriptResult,
  ScriptLogEntry,
  ScriptTestResult,
  ScriptRunInfo,
  RequestRunnerFn,
} from '../types';

interface RequestContext {
  url: string;
  method: HttpMethod;
  headers: Record<string, string>;
  body: any;
}

interface ResponseContext {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: any;
  duration: number;
}

interface EnvData {
  variables: Record<string, string>;
  globals: Record<string, string>;
}

/** Plain cookie object exposed to scripts (no internal metadata like createdAt). */
export interface ScriptCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * Cookie context injected into ScriptEngine so scripts can read/write cookies.
 * All methods are async because the underlying CookieJarService is async.
 */
export interface CookieContext {
  getAll(): Promise<ScriptCookie[]>;
  getCookiesForUrl(url: string): Promise<ScriptCookie[]>;
  setCookie(cookie: ScriptCookie): Promise<void>;
  deleteCookie(domain: string, name: string): Promise<void>;
  clearAll(): Promise<void>;
}

// Capture Node.js globals before any sandbox is created so closures in hf.*
// still have access to them even though the sandbox sets them to undefined.
const nativeSetTimeout = setTimeout;
const nativeClearTimeout = clearTimeout;

const ASYNC_TIMEOUT_MS = 30_000;
const SYNC_TIMEOUT_MS  = 5_000;

export class ScriptEngine {
  private cookieContext?: CookieContext;

  constructor(private readonly requestRunner?: RequestRunnerFn) {}

  /** Attach a cookie context so scripts can use hf.cookies.* methods. */
  setCookieContext(ctx: CookieContext): void {
    this.cookieContext = ctx;
  }

  async executePreRequestScript(
    source: string,
    requestContext: RequestContext,
    envData: EnvData,
    info?: ScriptRunInfo
  ): Promise<ScriptResult> {
    return this.executeScript(source, 'pre-request', requestContext, null, envData, info);
  }

  async executePostResponseScript(
    source: string,
    requestContext: RequestContext,
    responseContext: ResponseContext,
    envData: EnvData,
    info?: ScriptRunInfo
  ): Promise<ScriptResult> {
    return this.executeScript(source, 'post-response', requestContext, responseContext, envData, info);
  }

  private async executeScript(
    source: string,
    phase: 'pre-request' | 'post-response',
    requestContext: RequestContext,
    responseContext: ResponseContext | null,
    envData: EnvData,
    info?: ScriptRunInfo
  ): Promise<ScriptResult> {
    const startTime = Date.now();
    const logs: ScriptLogEntry[] = [];
    const testResults: ScriptTestResult[] = [];
    const variablesToSet: { key: string; value: string; scope: 'environment' | 'global' }[] = [];
    let modifiedRequest: ScriptResult['modifiedRequest'] | undefined;
    let nextRequestName: string | undefined;

    try {
      const allVars: Record<string, string> = { ...envData.globals, ...envData.variables };

      // Build the request proxy
      const requestProxy = {
        url: requestContext.url,
        method: requestContext.method,
        headers: { ...requestContext.headers },
        body: requestContext.body,
        setHeader(name: string, value: string) {
          this.headers[name] = value;
        },
        removeHeader(name: string) {
          delete this.headers[name];
        },
      };

      // Build the response object (read-only in post, unavailable in pre)
      const responseObj = responseContext
        ? {
            status: responseContext.status,
            statusText: responseContext.statusText,
            headers: { ...responseContext.headers },
            body: responseContext.body,
            duration: responseContext.duration,
            json() {
              if (typeof this.body === 'string') {
                return JSON.parse(this.body);
              }
              return this.body;
            },
            text() {
              return typeof this.body === 'string' ? this.body : JSON.stringify(this.body);
            },
          }
        : undefined;

      // Build the hf API
      const hf: Record<string, any> = {
        request: requestProxy,
        getVar(name: string): string | undefined {
          return allVars[name];
        },
        setVar(name: string, value: string, scope: 'environment' | 'global' = 'environment') {
          allVars[name] = value;
          variablesToSet.push({ key: name, value, scope });
        },
        test(name: string, fn: () => void) {
          try {
            fn();
            testResults.push({ name, passed: true });
          } catch (err: any) {
            testResults.push({ name, passed: false, error: err?.message || String(err) });
          }
        },
        uuid(): string {
          return crypto.randomUUID();
        },
        hash: {
          md5(str: string): string {
            return crypto.createHash('md5').update(str).digest('hex');
          },
          sha256(str: string): string {
            return crypto.createHash('sha256').update(str).digest('hex');
          },
        },
        base64: {
          encode(str: string): string {
            return Buffer.from(str).toString('base64');
          },
          decode(str: string): string {
            return Buffer.from(str, 'base64').toString();
          },
        },
        setNextRequest(nameOrId: string) {
          nextRequestName = nameOrId;
        },
        // Cookie manipulation
        cookies: this.buildCookiesApi(),
        // Async helpers
        delay(ms: number): Promise<void> {
          return new Promise((resolve) => nativeSetTimeout(resolve, ms));
        },
        async sendRequest(config: { url: string; method?: string; headers?: Record<string, string>; body?: any }) {
          if (!this._requestRunner) {
            throw new Error('hf.sendRequest() is not available in this context');
          }
          return this._requestRunner(config);
        },
        _requestRunner: this.requestRunner,
      };

      if (responseObj) {
        hf.response = responseObj;
      }

      if (info) {
        hf.info = { ...info };
      }

      // Build console proxy
      const makeConsole = (level: ScriptLogEntry['level']) => {
        return (...args: any[]) => {
          logs.push({
            level,
            args: args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))),
            timestamp: Date.now(),
          });
        };
      };

      const consoleProxy = {
        log: makeConsole('log'),
        warn: makeConsole('warn'),
        error: makeConsole('error'),
        info: makeConsole('info'),
      };

      // Create sandbox context
      const sandbox: Record<string, any> = {
        hf,
        expect,
        assert,
        console: consoleProxy,
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        clearTimeout: undefined,
        clearInterval: undefined,
        clearImmediate: undefined,
        process: undefined,
        global: undefined,
        require: undefined,
        module: undefined,
        exports: undefined,
        __filename: undefined,
        __dirname: undefined,
      };

      const context = vm.createContext(sandbox, {
        codeGeneration: { strings: false, wasm: false },
      });

      // Wrap user script in an async IIFE so await works inside
      const wrappedSource = `(async function() {\n${source}\n})()`;
      const script = new vm.Script(wrappedSource, { filename: `${phase}-script.js` });

      // Run synchronously (this returns a Promise from the async IIFE)
      const scriptPromise = script.runInContext(context, { timeout: SYNC_TIMEOUT_MS }) as Promise<void>;

      // Race against overall async timeout
      let timeoutHandle: ReturnType<typeof nativeSetTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutHandle = nativeSetTimeout(
          () => reject(new Error(`Script timed out after ${ASYNC_TIMEOUT_MS / 1000}s`)),
          ASYNC_TIMEOUT_MS
        );
      });

      try {
        await Promise.race([scriptPromise, timeoutPromise]);
      } finally {
        nativeClearTimeout(timeoutHandle!);
      }

      // Collect modifications from pre-request
      if (phase === 'pre-request') {
        const rp = requestProxy;
        const changed =
          rp.url !== requestContext.url ||
          rp.method !== requestContext.method ||
          JSON.stringify(rp.headers) !== JSON.stringify(requestContext.headers) ||
          rp.body !== requestContext.body;

        if (changed) {
          modifiedRequest = {
            url: rp.url,
            method: rp.method,
            headers: rp.headers,
            body: rp.body,
          };
        }
      }

      return {
        success: true,
        logs,
        testResults,
        variablesToSet,
        modifiedRequest,
        nextRequest: nextRequestName,
        duration: Date.now() - startTime,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || String(err),
        logs,
        testResults,
        variablesToSet,
        modifiedRequest,
        nextRequest: nextRequestName,
        duration: Date.now() - startTime,
      };
    }
  }

  private buildCookiesApi(): Record<string, any> {
    const ctx = this.cookieContext;
    const unavailable = (method: string) => () => {
      throw new Error(`hf.cookies.${method}() is not available in this context`);
    };

    if (!ctx) {
      return {
        getAll: unavailable('getAll'),
        get: unavailable('get'),
        getByUrl: unavailable('getByUrl'),
        set: unavailable('set'),
        delete: unavailable('delete'),
        clear: unavailable('clear'),
      };
    }

    return {
      async getAll(): Promise<ScriptCookie[]> {
        return ctx.getAll();
      },
      async get(name: string): Promise<ScriptCookie | undefined> {
        const all = await ctx.getAll();
        return all.find(c => c.name === name);
      },
      async getByUrl(url: string): Promise<ScriptCookie[]> {
        return ctx.getCookiesForUrl(url);
      },
      async set(cookie: ScriptCookie): Promise<void> {
        if (!cookie || !cookie.name || !cookie.domain) {
          throw new Error('hf.cookies.set() requires at least name and domain');
        }
        return ctx.setCookie(cookie);
      },
      async delete(domain: string, name: string): Promise<void> {
        return ctx.deleteCookie(domain, name);
      },
      async clear(): Promise<void> {
        return ctx.clearAll();
      },
    };
  }
}
