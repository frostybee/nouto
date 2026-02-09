import { executeRequest } from './HttpClient';
import { evaluateAssertions } from './AssertionEngine';
import { ScriptEngine } from './ScriptEngine';
import { resolveScriptsForRequest } from './ScriptInheritanceService';
import type {
  SavedRequest,
  EnvironmentsData,
  CollectionRunConfig,
  CollectionRunRequestResult,
  CollectionRunResult,
  EnvironmentVariable,
  Collection,
  ScriptLogEntry,
  ScriptTestResult,
} from './types';

export class CollectionRunnerService {
  private abortController: AbortController | null = null;
  private scriptEngine = new ScriptEngine();

  async runCollection(
    requests: SavedRequest[],
    config: CollectionRunConfig,
    collectionName: string,
    envData: EnvironmentsData,
    onProgress: (progress: { current: number; total: number; requestName: string }) => void,
    onRequestComplete: (result: CollectionRunRequestResult) => void,
    collection?: Collection | null,
  ): Promise<CollectionRunResult> {
    const startedAt = new Date().toISOString();
    this.abortController = new AbortController();
    const results: CollectionRunRequestResult[] = [];
    let stoppedEarly = false;
    const responseContext: Map<string, any> = new Map();

    // Build name-to-index and id-to-index lookup maps
    const nameToIndex = new Map<string, number>();
    const idToIndex = new Map<string, number>();
    const requestNameToId = new Map<string, string>();
    for (let i = 0; i < requests.length; i++) {
      nameToIndex.set(requests[i].name, i);
      idToIndex.set(requests[i].id, i);
      requestNameToId.set(requests[i].name, requests[i].id);
    }

    const MAX_ITERATIONS = requests.length * 10;
    let iterationCount = 0;
    let currentIndex = 0;

    while (currentIndex < requests.length && iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      if (this.abortController?.signal.aborted) {
        stoppedEarly = true;
        break;
      }

      const request = requests[currentIndex];
      onProgress({ current: results.length + 1, total: requests.length, requestName: request.name });

      try {
        // Resolve scripts
        const scriptLogs: ScriptLogEntry[] = [];
        const scriptTestResults: ScriptTestResult[] = [];
        let nextRequestTarget: string | undefined;

        // Get env data for scripts
        const envScriptData = this.getEnvDataForScripts(envData);

        // Resolve inherited + request-level scripts
        let preScripts: { source: string; level: string }[] = [];
        let postScripts: { source: string; level: string }[] = [];

        if (collection) {
          const resolved = resolveScriptsForRequest(collection, request.id);
          preScripts = resolved.preRequestScripts;
          postScripts = resolved.postResponseScripts;
        }

        // Add request-level scripts
        if (request.scripts?.preRequest?.trim()) {
          preScripts.push({ source: request.scripts.preRequest, level: request.name });
        }
        if (request.scripts?.postResponse?.trim()) {
          postScripts.push({ source: request.scripts.postResponse, level: request.name });
        }

        // Build request context for scripts
        const requestHeaders: Record<string, string> = {};
        for (const h of request.headers || []) {
          if (h.enabled && h.key) {
            requestHeaders[h.key] = h.value;
          }
        }

        const scriptRequestContext = {
          url: this.substituteVariables(request.url, envData, responseContext, requestNameToId),
          method: request.method,
          headers: { ...requestHeaders },
          body: request.body?.content || null,
        };

        // Run pre-request scripts
        let modifiedConfig: any = null;
        for (const { source } of preScripts) {
          const preResult = this.scriptEngine.executePreRequestScript(source, scriptRequestContext, envScriptData);
          scriptLogs.push(...preResult.logs);
          scriptTestResults.push(...preResult.testResults);

          // Apply variable changes
          for (const { key, value, scope } of preResult.variablesToSet) {
            this.applyVariableChange(envData, key, value, scope);
            envScriptData.variables[key] = value;
          }

          if (preResult.modifiedRequest) {
            modifiedConfig = preResult.modifiedRequest;
            if (modifiedConfig.url) scriptRequestContext.url = modifiedConfig.url;
            if (modifiedConfig.method) scriptRequestContext.method = modifiedConfig.method;
            if (modifiedConfig.headers) Object.assign(scriptRequestContext.headers, modifiedConfig.headers);
          }

          if (preResult.nextRequest) {
            nextRequestTarget = preResult.nextRequest;
          }

          if (!preResult.success) break;
        }

        // Execute the HTTP request with substituted values (scripts may have modified them)
        const result = await this.executeSingleRequest(request, envData, responseContext, requestNameToId, modifiedConfig);

        // Store response for chaining (with full response data)
        responseContext.set(request.id, result);

        // Run post-response scripts
        if (postScripts.length > 0 && result.status > 0) {
          const responseBody = result.responseData;
          const responseHeaders = result.responseHeaders || {};

          const responseCtx = {
            status: result.status,
            statusText: result.statusText,
            headers: responseHeaders,
            body: responseBody,
            duration: result.duration,
          };

          for (const { source } of postScripts) {
            const postResult = this.scriptEngine.executePostResponseScript(source, scriptRequestContext, responseCtx, envScriptData);
            scriptLogs.push(...postResult.logs);
            scriptTestResults.push(...postResult.testResults);

            // Apply variable changes
            for (const { key, value, scope } of postResult.variablesToSet) {
              this.applyVariableChange(envData, key, value, scope);
              envScriptData.variables[key] = value;
            }

            if (postResult.nextRequest) {
              nextRequestTarget = postResult.nextRequest;
            }

            if (!postResult.success) break;
          }
        }

        // Attach script logs and test results to the result
        if (scriptLogs.length > 0) result.scriptLogs = scriptLogs;
        if (scriptTestResults.length > 0) result.scriptTestResults = scriptTestResults;

        // If script tests failed, mark the result as failed
        if (scriptTestResults.some(t => !t.passed)) {
          result.passed = false;
        }

        results.push(result);
        onRequestComplete(result);

        if (config.stopOnFailure && !result.passed) {
          stoppedEarly = true;
          break;
        }

        // Handle flow control via setNextRequest
        if (nextRequestTarget) {
          const targetByName = nameToIndex.get(nextRequestTarget);
          const targetById = idToIndex.get(nextRequestTarget);
          const targetIndex = targetByName ?? targetById;

          if (targetIndex !== undefined) {
            currentIndex = targetIndex;
          } else {
            // Unknown target — continue to next
            currentIndex++;
          }
        } else {
          currentIndex++;
        }
      } catch (error) {
        if (this.abortController?.signal.aborted) {
          stoppedEarly = true;
          break;
        }

        const errorResult: CollectionRunRequestResult = {
          requestId: request.id,
          requestName: request.name,
          method: request.method,
          url: request.url,
          status: 0,
          statusText: 'Error',
          duration: 0,
          size: 0,
          passed: false,
          error: (error as Error).message,
        };
        results.push(errorResult);
        onRequestComplete(errorResult);

        if (config.stopOnFailure) {
          stoppedEarly = true;
          break;
        }

        currentIndex++;
      }

      // Delay between requests
      if (config.delayMs > 0 && currentIndex < requests.length && !this.abortController?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, config.delayMs));
      }
    }

    // If we hit the iteration limit, mark as stopped early
    if (iterationCount >= MAX_ITERATIONS) {
      stoppedEarly = true;
    }

    const completedAt = new Date().toISOString();
    const passedRequests = results.filter(r => r.passed).length;
    const failedRequests = results.filter(r => !r.passed).length;
    const skippedRequests = requests.length - results.length;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    this.abortController = null;

    return {
      collectionId: config.collectionId,
      collectionName,
      startedAt,
      completedAt,
      totalRequests: requests.length,
      passedRequests,
      failedRequests,
      skippedRequests,
      totalDuration,
      results,
      stoppedEarly,
    };
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private getEnvDataForScripts(envData: EnvironmentsData): { variables: Record<string, string>; globals: Record<string, string> } {
    const variables: Record<string, string> = {};
    const globals: Record<string, string> = {};
    const activeEnv = envData.environments.find(e => e.id === envData.activeId);
    if (activeEnv) {
      for (const v of activeEnv.variables) {
        if (v.enabled) variables[v.key] = v.value;
      }
    }
    for (const v of (envData.globalVariables || [])) {
      if (v.enabled) globals[v.key] = v.value;
    }
    return { variables, globals };
  }

  private applyVariableChange(envData: EnvironmentsData, key: string, value: string, scope: 'environment' | 'global'): void {
    if (scope === 'global') {
      if (!envData.globalVariables) envData.globalVariables = [];
      const existing = envData.globalVariables.find(v => v.key === key);
      if (existing) {
        existing.value = value;
      } else {
        envData.globalVariables.push({ key, value, enabled: true });
      }
    } else {
      const activeEnv = envData.environments.find(e => e.id === envData.activeId);
      if (activeEnv) {
        const existing = activeEnv.variables.find(v => v.key === key);
        if (existing) {
          existing.value = value;
        } else {
          activeEnv.variables.push({ key, value, enabled: true });
        }
      }
    }
  }

  private async executeSingleRequest(
    request: SavedRequest,
    envData: EnvironmentsData,
    responseContext: Map<string, any>,
    requestNameToId: Map<string, string>,
    modifiedConfig?: any,
  ): Promise<CollectionRunRequestResult> {
    const startTime = Date.now();

    // Build resolved URL with variable substitution
    const url = modifiedConfig?.url || this.substituteVariables(request.url, envData, responseContext, requestNameToId);

    // Build headers
    const headers: Record<string, string> = {};
    for (const h of request.headers || []) {
      if (h.enabled && h.key) {
        headers[this.substituteVariables(h.key, envData, responseContext, requestNameToId)] =
          this.substituteVariables(h.value, envData, responseContext, requestNameToId);
      }
    }

    // Apply modified headers from scripts
    if (modifiedConfig?.headers) {
      Object.assign(headers, modifiedConfig.headers);
    }

    // Build params
    const params: Record<string, string> = {};
    for (const p of request.params || []) {
      if (p.enabled && p.key) {
        params[this.substituteVariables(p.key, envData, responseContext, requestNameToId)] =
          this.substituteVariables(p.value, envData, responseContext, requestNameToId);
      }
    }

    const method = modifiedConfig?.method || request.method || 'GET';

    // Build request config
    const config: any = {
      method,
      url,
      headers,
      params,
      timeout: 30000,
      signal: this.abortController?.signal,
    };

    // Handle body
    if (request.body && request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      if (modifiedConfig?.body !== undefined) {
        config.data = modifiedConfig.body;
      } else {
        const content = this.substituteVariables(request.body.content || '', envData, responseContext, requestNameToId);

        if (request.body.type === 'json' && content) {
          try {
            config.data = JSON.parse(content);
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          } catch {
            config.data = content;
            headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
          }
        } else if (request.body.type === 'text' && content) {
          config.data = content;
          headers['Content-Type'] = headers['Content-Type'] || 'text/plain';
        } else if (request.body.type === 'graphql' && content) {
          const payload: Record<string, any> = { query: content };
          if (request.body.graphqlVariables) {
            const vars = this.substituteVariables(request.body.graphqlVariables, envData, responseContext, requestNameToId);
            try { payload.variables = JSON.parse(vars); } catch {}
          }
          if (request.body.graphqlOperationName) {
            payload.operationName = request.body.graphqlOperationName;
          }
          config.data = payload;
          headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        } else if (request.body.type === 'x-www-form-urlencoded' && content) {
          try {
            const formItems = JSON.parse(content);
            const formData = new URLSearchParams();
            for (const item of formItems) {
              if (item.enabled && item.key) {
                formData.append(item.key, item.value || '');
              }
            }
            config.data = formData.toString();
            headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
          } catch {
            config.data = content;
          }
        } else if (content) {
          config.data = content;
        }
      }
    }

    // Handle auth
    if (request.auth) {
      if (request.auth.type === 'bearer' && request.auth.token) {
        headers['Authorization'] = `Bearer ${this.substituteVariables(request.auth.token, envData, responseContext, requestNameToId)}`;
      } else if (request.auth.type === 'basic' && request.auth.username) {
        config.auth = {
          username: this.substituteVariables(request.auth.username, envData, responseContext, requestNameToId),
          password: this.substituteVariables(request.auth.password || '', envData, responseContext, requestNameToId),
        };
      } else if (request.auth.type === 'apikey' && request.auth.apiKeyName && request.auth.apiKeyValue) {
        const keyName = this.substituteVariables(request.auth.apiKeyName, envData, responseContext, requestNameToId);
        const keyValue = this.substituteVariables(request.auth.apiKeyValue, envData, responseContext, requestNameToId);
        if (request.auth.apiKeyIn === 'query') {
          params[keyName] = keyValue;
          config.params = params;
        } else {
          headers[keyName] = keyValue;
        }
      }
    }

    config.headers = headers;

    const result = await executeRequest(config);
    const duration = Date.now() - startTime;
    const size = this.calculateSize(result.data);

    // Evaluate assertions if present
    let assertionResults;
    let passed = result.status < 400;

    if (request.assertions && request.assertions.length > 0) {
      const enabledAssertions = request.assertions.filter(a => a.enabled);
      if (enabledAssertions.length > 0) {
        const assertionResponse = {
          status: result.status,
          statusText: result.statusText,
          headers: result.headers as Record<string, string>,
          data: result.data,
          duration,
        };
        const evalResult = evaluateAssertions(request.assertions, assertionResponse);
        assertionResults = evalResult.results;
        passed = evalResult.results.every(r => r.passed);

        // Handle setVariable: update envData for subsequent requests
        for (const { key, value } of evalResult.variablesToSet) {
          this.applyVariableChange(envData, key, value, 'environment');
        }
      }
    }

    return {
      requestId: request.id,
      requestName: request.name,
      method: request.method,
      url,
      status: result.status,
      statusText: result.statusText,
      duration,
      size,
      passed,
      assertionResults,
      responseData: result.data,
      responseHeaders: result.headers as Record<string, string>,
    };
  }

  private substituteVariables(
    text: string,
    envData: EnvironmentsData,
    responseContext: Map<string, any>,
    requestNameToId: Map<string, string>,
  ): string {
    if (!text || !text.includes('{{')) return text;

    // Get active environment variables
    const activeEnv = envData.environments.find(e => e.id === envData.activeId);
    const envVars: EnvironmentVariable[] = [
      ...(envData.globalVariables || []),
      ...(activeEnv?.variables || []),
    ];

    return text.replace(/\{\{(.*?)\}\}/g, (_match, key: string) => {
      const trimmed = key.trim();

      // Dynamic variables
      if (trimmed === '$guid') return this.generateUuid();
      if (trimmed === '$timestamp') return String(Math.floor(Date.now() / 1000));
      if (trimmed === '$isoTimestamp') return new Date().toISOString();
      if (trimmed === '$randomInt') return String(Math.floor(Math.random() * 1000));

      // Named request references: {{RequestName.$response.body.field}}
      const namedRefMatch = trimmed.match(/^(.+?)\.\$response\.(.+)$/);
      if (namedRefMatch) {
        const [, reqName, responsePath] = namedRefMatch;
        const reqId = requestNameToId.get(reqName);
        if (reqId) {
          const prevResult = responseContext.get(reqId);
          if (prevResult) {
            const value = this.resolveResponsePath(prevResult, responsePath);
            if (value !== undefined) return String(value);
          }
        }
        return `{{${key}}}`;
      }

      // Response chaining: {{$response.body.field}}
      if (trimmed.startsWith('$response.body.')) {
        const fieldPath = trimmed.substring('$response.body.'.length);
        // Use the most recent response
        const entries = Array.from(responseContext.values());
        if (entries.length > 0) {
          const lastResponse = entries[entries.length - 1];
          if (lastResponse && typeof lastResponse === 'object') {
            return this.getNestedValue(lastResponse, fieldPath) ?? `{{${key}}}`;
          }
        }
        return `{{${key}}}`;
      }

      if (trimmed.startsWith('$response.status')) {
        const entries = Array.from(responseContext.values());
        if (entries.length > 0) {
          const lastResponse = entries[entries.length - 1];
          if (lastResponse && typeof lastResponse === 'object' && lastResponse.status !== undefined) {
            return String(lastResponse.status);
          }
        }
        return `{{${key}}}`;
      }

      if (trimmed.startsWith('$response.headers.')) {
        const headerName = trimmed.substring('$response.headers.'.length);
        const entries = Array.from(responseContext.values());
        if (entries.length > 0) {
          const lastResponse = entries[entries.length - 1];
          if (lastResponse?.responseHeaders) {
            const val = lastResponse.responseHeaders[headerName] || lastResponse.responseHeaders[headerName.toLowerCase()];
            if (val !== undefined) return String(val);
          }
        }
        return `{{${key}}}`;
      }

      // Environment variables
      const envVar = envVars.find(v => v.enabled && v.key === trimmed);
      if (envVar) return envVar.value;

      return `{{${key}}}`;
    });
  }

  private resolveResponsePath(result: CollectionRunRequestResult, path: string): any {
    // path: "body.field.subfield", "status", "headers.content-type"
    if (path.startsWith('body.')) {
      const fieldPath = path.substring('body.'.length);
      let data = result.responseData;
      if (typeof data === 'string') {
        try { data = JSON.parse(data); } catch { return undefined; }
      }
      return this.getNestedValue({ data }, `data.${fieldPath}`.replace(/^data\./, ''));
    }
    if (path === 'body') {
      return result.responseData;
    }
    if (path === 'status') {
      return result.status;
    }
    if (path === 'statusText') {
      return result.statusText;
    }
    if (path.startsWith('headers.')) {
      const headerName = path.substring('headers.'.length);
      if (result.responseHeaders) {
        return result.responseHeaders[headerName] || result.responseHeaders[headerName.toLowerCase()];
      }
    }
    return undefined;
  }

  private getNestedValue(obj: any, path: string): string | undefined {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    if (current !== undefined) {
      if (typeof current === 'object') return JSON.stringify(current);
      return String(current);
    }
    return undefined;
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private calculateSize(data: any): number {
    if (typeof data === 'string') {
      return Buffer.byteLength(data, 'utf8');
    }
    return Buffer.byteLength(JSON.stringify(data || ''), 'utf8');
  }
}
