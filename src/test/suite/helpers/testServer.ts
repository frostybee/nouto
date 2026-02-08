import * as http from 'http';

export interface TestServerConfig {
  routes?: Record<string, (req: http.IncomingMessage, res: http.ServerResponse) => void>;
}

export function createTestServer(config?: TestServerConfig): http.Server {
  const routes = config?.routes ?? {};

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost`);
    const pathname = url.pathname;

    // Check custom routes first
    const handler = routes[`${req.method} ${pathname}`] || routes[pathname];
    if (handler) {
      handler(req, res);
      return;
    }

    // Built-in routes
    switch (pathname) {
      case '/json': {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'hello', items: [1, 2, 3] }));
        break;
      }

      case '/text': {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello, World!');
        break;
      }

      case '/echo-body': {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            method: req.method,
            body,
            headers: req.headers,
          }));
        });
        break;
      }

      case '/echo-headers': {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ headers: req.headers }));
        break;
      }

      case '/echo-method': {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: req.method }));
        break;
      }

      case '/slow': {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('slow response');
        }, 5000);
        break;
      }

      case '/redirect': {
        res.writeHead(302, { Location: '/json' });
        res.end();
        break;
      }

      case '/status/404': {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        break;
      }

      case '/status/500': {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
        break;
      }

      default: {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        break;
      }
    }
  });

  return server;
}

export function startServer(server: http.Server, port = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        resolve(addr.port);
      } else {
        reject(new Error('Could not determine server port'));
      }
    });
    server.once('error', reject);
  });
}

export function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
