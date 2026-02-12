import { executeRequest } from './HttpClient';
import type {
  SavedRequest,
  EnvironmentsData,
  BenchmarkConfig,
  BenchmarkIteration,
  BenchmarkStatistics,
  BenchmarkResult,
  EnvironmentVariable,
} from './types';

export class BenchmarkService {
  private abortController: AbortController | null = null;

  async run(
    request: SavedRequest,
    config: BenchmarkConfig,
    envData: EnvironmentsData,
    onProgress: (current: number, total: number) => void,
    onIteration: (iteration: BenchmarkIteration) => void,
  ): Promise<BenchmarkResult> {
    const startedAt = new Date().toISOString();
    this.abortController = new AbortController();
    const iterations: BenchmarkIteration[] = [];
    const url = this.substituteVariables(request.url, envData);

    if (config.concurrency <= 1) {
      // Sequential mode
      for (let i = 0; i < config.iterations; i++) {
        if (this.abortController.signal.aborted) break;
        onProgress(i + 1, config.iterations);
        const result = await this.executeSingle(request, envData, i + 1);
        iterations.push(result);
        onIteration(result);
        if (config.delayBetweenMs > 0 && i < config.iterations - 1 && !this.abortController.signal.aborted) {
          await this.delay(config.delayBetweenMs);
        }
      }
    } else {
      // Concurrent mode: process in chunks
      let completed = 0;
      for (let i = 0; i < config.iterations; i += config.concurrency) {
        if (this.abortController.signal.aborted) break;
        const chunkSize = Math.min(config.concurrency, config.iterations - i);
        const chunkStartTime = Date.now();
        const promises: Promise<BenchmarkIteration>[] = [];
        for (let j = 0; j < chunkSize; j++) {
          promises.push(this.executeSingle(request, envData, i + j + 1));
        }
        const results = await Promise.allSettled(promises);
        for (const result of results) {
          completed++;
          if (result.status === 'fulfilled') {
            iterations.push(result.value);
            onIteration(result.value);
          } else {
            // Promise rejected — record as a failed iteration
            const errorIteration: BenchmarkIteration = {
              iteration: completed,
              status: 0,
              statusText: 'Error',
              duration: Date.now() - chunkStartTime,
              size: 0,
              success: false,
              error: result.reason?.message || String(result.reason),
              timestamp: chunkStartTime,
            };
            iterations.push(errorIteration);
            onIteration(errorIteration);
          }
          onProgress(completed, config.iterations);
        }
      }
    }

    const completedAt = new Date().toISOString();
    this.abortController = null;

    const statistics = this.computeStatistics(iterations, startedAt, completedAt);
    const distribution = this.computeDistribution(iterations);

    return {
      requestName: request.name,
      url,
      method: request.method,
      config,
      startedAt,
      completedAt,
      statistics,
      iterations,
      distribution,
    };
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private async executeSingle(
    request: SavedRequest,
    envData: EnvironmentsData,
    iteration: number,
  ): Promise<BenchmarkIteration> {
    const startTime = Date.now();
    try {
      const url = this.substituteVariables(request.url, envData);
      const headers: Record<string, string> = {};
      for (const h of request.headers || []) {
        if (h.enabled && h.key) {
          headers[this.substituteVariables(h.key, envData)] =
            this.substituteVariables(h.value, envData);
        }
      }
      const params: Record<string, string> = {};
      for (const p of request.params || []) {
        if (p.enabled && p.key) {
          params[this.substituteVariables(p.key, envData)] =
            this.substituteVariables(p.value, envData);
        }
      }

      const requestConfig: any = {
        method: request.method || 'GET',
        url,
        headers,
        params,
        timeout: 30000,
        signal: this.abortController?.signal,
      };

      // Handle body
      if (request.body && request.body.type !== 'none' && ['POST', 'PUT', 'PATCH'].includes(requestConfig.method.toUpperCase())) {
        const content = this.substituteVariables(request.body.content || '', envData);
        if (request.body.type === 'json' && content) {
          try {
            requestConfig.data = JSON.parse(content);
            headers['Content-Type'] = headers['Content-Type'] || 'application/json';
          } catch {
            requestConfig.data = content;
          }
        } else if (content) {
          requestConfig.data = content;
        }
        requestConfig.headers = headers;
      }

      // Handle auth
      if (request.auth) {
        if (request.auth.type === 'bearer' && request.auth.token) {
          headers['Authorization'] = `Bearer ${this.substituteVariables(request.auth.token, envData)}`;
          requestConfig.headers = headers;
        } else if (request.auth.type === 'basic' && request.auth.username) {
          requestConfig.auth = {
            username: this.substituteVariables(request.auth.username, envData),
            password: this.substituteVariables(request.auth.password || '', envData),
          };
        }
      }

      const result = await executeRequest(requestConfig);
      const duration = Date.now() - startTime;
      const size = this.calculateSize(result.data);

      return {
        iteration,
        status: result.status,
        statusText: result.statusText,
        duration,
        size,
        success: result.status < 400,
        timestamp: startTime,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      return {
        iteration,
        status: 0,
        statusText: 'Error',
        duration,
        size: 0,
        success: false,
        error: error.message || 'Unknown error',
        timestamp: startTime,
      };
    }
  }

  computeStatistics(iterations: BenchmarkIteration[], startedAt: string, completedAt: string): BenchmarkStatistics {
    const successIterations = iterations.filter(i => i.success);
    const durations = iterations.map(i => i.duration).sort((a, b) => a - b);
    const totalDuration = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    if (durations.length === 0) {
      return {
        totalIterations: iterations.length,
        successCount: 0,
        failCount: iterations.length,
        min: 0, max: 0, mean: 0, median: 0,
        p50: 0, p75: 0, p90: 0, p95: 0, p99: 0,
        totalDuration,
        requestsPerSecond: 0,
      };
    }

    const sum = durations.reduce((a, b) => a + b, 0);
    const mean = sum / durations.length;

    return {
      totalIterations: iterations.length,
      successCount: successIterations.length,
      failCount: iterations.length - successIterations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      mean: Math.round(mean * 100) / 100,
      median: this.percentile(durations, 50),
      p50: this.percentile(durations, 50),
      p75: this.percentile(durations, 75),
      p90: this.percentile(durations, 90),
      p95: this.percentile(durations, 95),
      p99: this.percentile(durations, 99),
      totalDuration,
      requestsPerSecond: totalDuration > 0 ? Math.round((iterations.length / (totalDuration / 1000)) * 100) / 100 : 0,
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  computeDistribution(iterations: BenchmarkIteration[]): { bucket: string; count: number }[] {
    const durations = iterations.map(i => i.duration);
    if (durations.length === 0) return [];

    const min = Math.min(...durations);
    const max = Math.max(...durations);
    if (min === max) {
      return [{ bucket: `${min}ms`, count: durations.length }];
    }

    const bucketCount = 10;
    const range = max - min;
    const bucketSize = range / bucketCount;
    const buckets: { bucket: string; count: number }[] = [];

    for (let i = 0; i < bucketCount; i++) {
      const low = Math.round(min + i * bucketSize);
      const high = Math.round(min + (i + 1) * bucketSize);
      const count = durations.filter(d => {
        if (i === bucketCount - 1) return d >= low && d <= high;
        return d >= low && d < high;
      }).length;
      buckets.push({ bucket: `${low}-${high}ms`, count });
    }

    return buckets;
  }

  private substituteVariables(text: string, envData: EnvironmentsData): string {
    if (!text || !text.includes('{{')) return text;

    const activeEnv = envData.environments.find(e => e.id === envData.activeId);
    const envVars: EnvironmentVariable[] = [
      ...(envData.globalVariables || []),
      ...(activeEnv?.variables || []),
    ];

    return text.replace(/\{\{(.*?)\}\}/g, (_match, key: string) => {
      const trimmed = key.trim();
      if (trimmed === '$guid') return this.generateUuid();
      if (trimmed === '$timestamp') return String(Math.floor(Date.now() / 1000));
      if (trimmed === '$isoTimestamp') return new Date().toISOString();
      if (trimmed === '$randomInt') return String(Math.floor(Math.random() * 1000));

      const envVar = envVars.find(v => v.enabled && v.key === trimmed);
      if (envVar) return envVar.value;
      return `{{${key}}}`;
    });
  }

  private generateUuid(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  private calculateSize(data: any): number {
    if (typeof data === 'string') return Buffer.byteLength(data, 'utf8');
    return Buffer.byteLength(JSON.stringify(data || ''), 'utf8');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
