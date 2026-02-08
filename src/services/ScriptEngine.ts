import * as vm from 'vm';
import * as crypto from 'crypto';
import type { HttpMethod, ScriptResult, ScriptLogEntry, ScriptTestResult } from './types';

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

export class ScriptEngine {
  private readonly timeout = 5000;

  executePreRequestScript(
    source: string,
    requestContext: RequestContext,
    envData: EnvData
  ): ScriptResult {
    return this.executeScript(source, 'pre-request', requestContext, null, envData);
  }

  executePostResponseScript(
    source: string,
    requestContext: RequestContext,
    responseContext: ResponseContext,
    envData: EnvData
  ): ScriptResult {
    return this.executeScript(source, 'post-response', requestContext, responseContext, envData);
  }

  private executeScript(
    source: string,
    phase: 'pre-request' | 'post-response',
    requestContext: RequestContext,
    responseContext: ResponseContext | null,
    envData: EnvData
  ): ScriptResult {
    const startTime = Date.now();
    const logs: ScriptLogEntry[] = [];
    const testResults: ScriptTestResult[] = [];
    const variablesToSet: { key: string; value: string; scope: 'environment' | 'global' }[] = [];
    let modifiedRequest: ScriptResult['modifiedRequest'] | undefined;

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
      };

      if (responseObj) {
        hf.response = responseObj;
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
        console: consoleProxy,
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        clearTimeout: undefined,
        clearInterval: undefined,
        clearImmediate: undefined,
      };

      const context = vm.createContext(sandbox);
      const script = new vm.Script(source, { filename: `${phase}-script.js` });
      script.runInContext(context, { timeout: this.timeout });

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
        duration: Date.now() - startTime,
      };
    }
  }
}
