import { executeRequest } from './HttpClient';
import type {
  SavedRequest,
  EnvironmentsData,
  CollectionRunConfig,
  CollectionRunRequestResult,
  CollectionRunResult,
  EnvironmentVariable,
} from './types';

export class CollectionRunnerService {
  private abortController: AbortController | null = null;

  async runCollection(
    requests: SavedRequest[],
    config: CollectionRunConfig,
    collectionName: string,
    envData: EnvironmentsData,
    onProgress: (progress: { current: number; total: number; requestName: string }) => void,
    onRequestComplete: (result: CollectionRunRequestResult) => void,
  ): Promise<CollectionRunResult> {
    const startedAt = new Date().toISOString();
    this.abortController = new AbortController();
    const results: CollectionRunRequestResult[] = [];
    let stoppedEarly = false;
    const responseContext: Map<string, any> = new Map();

    for (let i = 0; i < requests.length; i++) {
      if (this.abortController?.signal.aborted) {
        stoppedEarly = true;
        break;
      }

      const request = requests[i];
      onProgress({ current: i + 1, total: requests.length, requestName: request.name });

      try {
        const result = await this.executeSingleRequest(request, envData, responseContext);
        results.push(result);
        onRequestComplete(result);

        // Store response for chaining
        responseContext.set(request.id, result);

        if (config.stopOnFailure && !result.passed) {
          stoppedEarly = true;
          break;
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
      }

      // Delay between requests
      if (config.delayMs > 0 && i < requests.length - 1 && !this.abortController?.signal.aborted) {
        await new Promise(resolve => setTimeout(resolve, config.delayMs));
      }
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

  private async executeSingleRequest(
    request: SavedRequest,
    envData: EnvironmentsData,
    responseContext: Map<string, any>,
  ): Promise<CollectionRunRequestResult> {
    const startTime = Date.now();

    // Build resolved URL with variable substitution
    const url = this.substituteVariables(request.url, envData, responseContext);

    // Build headers
    const headers: Record<string, string> = {};
    for (const h of request.headers || []) {
      if (h.enabled && h.key) {
        headers[this.substituteVariables(h.key, envData, responseContext)] =
          this.substituteVariables(h.value, envData, responseContext);
      }
    }

    // Build params
    const params: Record<string, string> = {};
    for (const p of request.params || []) {
      if (p.enabled && p.key) {
        params[this.substituteVariables(p.key, envData, responseContext)] =
          this.substituteVariables(p.value, envData, responseContext);
      }
    }

    // Build request config
    const config: any = {
      method: request.method || 'GET',
      url,
      headers,
      params,
      timeout: 30000,
      signal: this.abortController?.signal,
    };

    // Handle body
    if (request.body && request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())) {
      const content = this.substituteVariables(request.body.content || '', envData, responseContext);

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
          const vars = this.substituteVariables(request.body.graphqlVariables, envData, responseContext);
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

    // Handle auth
    if (request.auth) {
      if (request.auth.type === 'bearer' && request.auth.token) {
        headers['Authorization'] = `Bearer ${this.substituteVariables(request.auth.token, envData, responseContext)}`;
      } else if (request.auth.type === 'basic' && request.auth.username) {
        config.auth = {
          username: this.substituteVariables(request.auth.username, envData, responseContext),
          password: this.substituteVariables(request.auth.password || '', envData, responseContext),
        };
      } else if (request.auth.type === 'apikey' && request.auth.apiKeyName && request.auth.apiKeyValue) {
        const keyName = this.substituteVariables(request.auth.apiKeyName, envData, responseContext);
        const keyValue = this.substituteVariables(request.auth.apiKeyValue, envData, responseContext);
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

    return {
      requestId: request.id,
      requestName: request.name,
      method: request.method,
      url,
      status: result.status,
      statusText: result.statusText,
      duration,
      size,
      passed: result.status < 400,
    };
  }

  private substituteVariables(
    text: string,
    envData: EnvironmentsData,
    responseContext: Map<string, any>,
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

      // Environment variables
      const envVar = envVars.find(v => v.enabled && v.key === trimmed);
      if (envVar) return envVar.value;

      return `{{${key}}}`;
    });
  }

  private getNestedValue(obj: any, path: string): string | undefined {
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current !== undefined ? String(current) : undefined;
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
