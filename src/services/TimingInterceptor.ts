import type { AxiosRequestConfig } from 'axios';
import type * as http from 'http';

// Use require() to get the raw CJS module objects.
// `import * as http` creates an ES module namespace with readonly getter properties,
// which prevents us from temporarily wrapping http.request/https.request.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const httpModule: any = require('http');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const httpsModule: any = require('https');

export interface TimingData {
  dnsLookup: number;
  tcpConnection: number;
  tlsHandshake: number;
  ttfb: number;
  contentTransfer: number;
  total: number;
}

/**
 * Creates a timed request config by temporarily wrapping http.request/https.request
 * to capture the ClientRequest object and attach socket-level timing listeners.
 *
 * This approach intercepts at the lowest level (Node's http module), so it works
 * regardless of what axios or follow-redirects does internally.
 *
 * The wrapper is synchronous and restores originals immediately upon capture,
 * so there are no race conditions with concurrent requests.
 */
export function createTimedRequest(config: AxiosRequestConfig): {
  config: AxiosRequestConfig;
  getTimings: () => TimingData;
} {
  const timestamps = {
    start: 0,
    dnsEnd: 0,
    tcpEnd: 0,
    tlsEnd: 0,
    firstByte: 0,
    end: 0,
  };

  function instrumentRequest(req: http.ClientRequest) {
    timestamps.start = Date.now();

    req.once('socket', (socket: any) => {
      if (socket.connecting) {
        socket.once('lookup', () => {
          timestamps.dnsEnd = Date.now();
        });

        socket.once('connect', () => {
          if (!timestamps.dnsEnd) {
            timestamps.dnsEnd = timestamps.start;
          }
          timestamps.tcpEnd = Date.now();
        });

        socket.once('secureConnect', () => {
          timestamps.tlsEnd = Date.now();
        });
      } else {
        // Socket reused from keep-alive pool
        timestamps.dnsEnd = timestamps.start;
        timestamps.tcpEnd = timestamps.start;
        if (socket.encrypted) {
          timestamps.tlsEnd = timestamps.start;
        }
      }
    });

    req.once('response', () => {
      timestamps.firstByte = Date.now();
    });
  }

  // Save originals from the raw CJS module (writable)
  const origHttpRequest = httpModule.request;
  const origHttpsRequest = httpsModule.request;
  let captured = false;

  function restore() {
    httpModule.request = origHttpRequest;
    httpsModule.request = origHttpsRequest;
  }

  function createWrapper(original: Function) {
    return function (this: any, ...args: any[]) {
      const req = original.apply(this, args);
      if (!captured) {
        captured = true;
        restore();
        instrumentRequest(req);
      }
      return req;
    };
  }

  // Temporarily replace http.request and https.request
  httpModule.request = createWrapper(origHttpRequest);
  httpsModule.request = createWrapper(origHttpsRequest);

  function getTimings(): TimingData {
    // Safety: restore originals if axios was never called
    if (!captured) {
      restore();
    }

    const now = Date.now();
    const start = timestamps.start || now;
    const dnsEnd = timestamps.dnsEnd || start;
    const tcpEnd = timestamps.tcpEnd || dnsEnd;
    const tlsEnd = timestamps.tlsEnd || tcpEnd;
    const firstByte = timestamps.firstByte || tlsEnd;
    const end = timestamps.end || now;

    return {
      dnsLookup: Math.max(0, dnsEnd - start),
      tcpConnection: Math.max(0, tcpEnd - dnsEnd),
      tlsHandshake: Math.max(0, tlsEnd - tcpEnd),
      ttfb: Math.max(0, firstByte - (tlsEnd || tcpEnd)),
      contentTransfer: Math.max(0, end - firstByte),
      total: Math.max(0, end - start),
    };
  }

  return { config: { ...config }, getTimings };
}
