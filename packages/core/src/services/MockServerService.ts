import * as http from 'http';
import type { MockRoute, MockServerConfig, MockServerStatus, MockRequestLog } from '../types';
import { generateId } from '../types';

interface CompiledRoute {
  route: MockRoute;
  regex: RegExp;
  paramNames: string[];
}

export class MockServerService {
  private server: http.Server | null = null;
  private status: MockServerStatus = 'stopped';
  private compiledRoutes: CompiledRoute[] = [];
  private requestLogs: MockRequestLog[] = [];
  private readonly maxLogs = 100;
  private forceCloseTimeout: ReturnType<typeof setTimeout> | null = null;
  private connections = new Set<import('net').Socket>();

  private onStatusChange?: (status: MockServerStatus) => void;
  private onLogAdded?: (log: MockRequestLog) => void;

  setStatusChangeHandler(handler: (status: MockServerStatus) => void): void {
    this.onStatusChange = handler;
  }

  setLogHandler(handler: (log: MockRequestLog) => void): void {
    this.onLogAdded = handler;
  }

  getStatus(): MockServerStatus {
    return this.status;
  }

  getLogs(): MockRequestLog[] {
    return [...this.requestLogs];
  }

  clearLogs(): void {
    this.requestLogs = [];
  }

  updateRoutes(routes: MockRoute[]): void {
    const compiled: CompiledRoute[] = [];
    for (const route of routes) {
      if (!route.enabled) continue;
      try {
        compiled.push(this.compileRoute(route));
      } catch (err) {
        console.warn(`[MockServer] Skipping invalid route "${route.path}":`, err);
      }
    }
    this.compiledRoutes = compiled;
  }

  async start(config: MockServerConfig): Promise<void> {
    if (this.server) {
      await this.stop();
    }

    this.setStatus('starting');
    this.updateRoutes(config.routes);

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('connection', (socket) => {
        this.connections.add(socket);
        socket.on('close', () => this.connections.delete(socket));
      });

      this.server.on('error', (err: NodeJS.ErrnoException) => {
        this.setStatus('error');
        reject(err);
      });

      this.server.listen(config.port, () => {
        this.setStatus('running');
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.server) return;

    // Clear any pending force-close timeout from a previous stop
    if (this.forceCloseTimeout) {
      clearTimeout(this.forceCloseTimeout);
      this.forceCloseTimeout = null;
    }

    this.setStatus('stopping');
    // Destroy all tracked connections so server.close() can complete immediately
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();
    return new Promise((resolve) => {
      this.server!.close(() => {
        this.server = null;
        this.setStatus('stopped');
        resolve();
      });
      // Fallback: force-close any remaining connections after 2s
      this.forceCloseTimeout = setTimeout(() => {
        this.server?.closeAllConnections?.();
        this.forceCloseTimeout = null;
      }, 2000);
    });
  }

  dispose(): void {
    if (this.forceCloseTimeout) {
      clearTimeout(this.forceCloseTimeout);
      this.forceCloseTimeout = null;
    }
    for (const socket of this.connections) {
      socket.destroy();
    }
    this.connections.clear();
    if (this.server) {
      this.server.closeAllConnections?.();
      this.server.close();
      this.server = null;
    }
    this.status = 'stopped';
  }

  private setStatus(status: MockServerStatus): void {
    this.status = status;
    this.onStatusChange?.(status);
  }

  private compileRoute(route: MockRoute): CompiledRoute {
    const paramNames: string[] = [];
    // Limit route path complexity to prevent ReDoS
    if (route.path.length > 500) {
      throw new Error(`Route path too long: ${route.path.substring(0, 50)}...`);
    }
    // Escape regex-special chars in literal segments, then convert :param placeholders
    const segments = route.path.split('/');
    if (segments.length > 50) {
      throw new Error(`Route path has too many segments (${segments.length}, max 50): ${route.path.substring(0, 50)}...`);
    }
    const regexParts = segments.map(seg => {
      const paramMatch = seg.match(/^:([a-zA-Z_][a-zA-Z0-9_]*)$/);
      if (paramMatch) {
        paramNames.push(paramMatch[1]);
        return '([^\\/]+)';
      }
      // Escape any regex-special characters in literal path segments
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    const regex = new RegExp(`^${regexParts.join('\\/')}$`);
    return { route, regex, paramNames };
  }

  private matchRoute(method: string, urlPath: string): { compiled: CompiledRoute; params: Record<string, string> } | null {
    for (const compiled of this.compiledRoutes) {
      if (compiled.route.method !== method.toUpperCase()) continue;
      const match = urlPath.match(compiled.regex);
      if (match) {
        const params: Record<string, string> = {};
        compiled.paramNames.forEach((name, i) => {
          params[name] = match[i + 1] || '';
        });
        return { compiled, params };
      }
    }
    return null;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const startTime = Date.now();
    const method = (req.method || 'GET').toUpperCase();
    const urlPath = (req.url || '/').split('?')[0];

    // Add CORS headers for convenience
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const matched = this.matchRoute(method, urlPath);

    if (!matched) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No matching mock route', path: urlPath, method }));
      this.addLog(method, urlPath, null, 404, Date.now() - startTime);
      return;
    }

    const { compiled, params } = matched;
    const route = compiled.route;

    // Apply custom response headers
    for (const header of route.responseHeaders) {
      if (header.enabled && header.key) {
        res.setHeader(header.key, header.value);
      }
    }

    // Substitute {{paramName}} in response body
    let body = route.responseBody;
    for (const [key, value] of Object.entries(params)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      body = body.replace(new RegExp(`\\{\\{${escaped}\\}\\}`, 'g'), value);
    }

    // Calculate latency
    const latency = route.latencyMin === route.latencyMax
      ? route.latencyMin
      : Math.random() * (route.latencyMax - route.latencyMin) + route.latencyMin;

    const sendResponse = () => {
      res.writeHead(route.statusCode);
      res.end(body);
      this.addLog(method, urlPath, route.id, route.statusCode, Date.now() - startTime);
    };

    if (latency > 0) {
      setTimeout(sendResponse, latency);
    } else {
      sendResponse();
    }
  }

  private addLog(method: string, path: string, matchedRouteId: string | null, statusCode: number, duration: number): void {
    const log: MockRequestLog = {
      id: generateId(),
      timestamp: Date.now(),
      method,
      path,
      matchedRouteId,
      statusCode,
      duration,
    };

    this.requestLogs.push(log);
    if (this.requestLogs.length > this.maxLogs) {
      this.requestLogs.shift();
    }

    this.onLogAdded?.(log);
  }
}
