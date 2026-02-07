import * as http from 'http';
import * as https from 'https';
import type { AxiosRequestConfig } from 'axios';

export interface TimingData {
  dnsLookup: number;
  tcpConnection: number;
  tlsHandshake: number;
  ttfb: number;
  contentTransfer: number;
  total: number;
}

/**
 * Creates a timed HTTP/HTTPS agent that instruments socket events
 * to capture detailed request timing breakdown.
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

  let firstByteRecorded = false;

  function instrumentSocket(socket: any) {
    timestamps.start = Date.now();

    socket.on('lookup', () => {
      timestamps.dnsEnd = Date.now();
    });

    socket.on('connect', () => {
      // If DNS didn't fire (cached or IP literal), set dnsEnd = start
      if (!timestamps.dnsEnd) timestamps.dnsEnd = timestamps.start;
      timestamps.tcpEnd = Date.now();
    });

    socket.on('secureConnect', () => {
      timestamps.tlsEnd = Date.now();
    });
  }

  // Create custom agents that intercept socket creation
  const httpAgent = new http.Agent() as any;
  const originalHttpCreateConnection = httpAgent.createConnection.bind(httpAgent);
  httpAgent.createConnection = function (options: any, oncreate: any) {
    const socket = originalHttpCreateConnection(options, oncreate);
    instrumentSocket(socket);
    return socket;
  };

  const httpsAgent = new https.Agent({ rejectUnauthorized: true }) as any;
  const originalHttpsCreateConnection = httpsAgent.createConnection.bind(httpsAgent);
  httpsAgent.createConnection = function (options: any, oncreate: any) {
    const socket = originalHttpsCreateConnection(options, oncreate);
    instrumentSocket(socket);
    return socket;
  };

  const timedConfig: AxiosRequestConfig = {
    ...config,
    httpAgent,
    httpsAgent,
    // Intercept the response to capture TTFB and transfer
    onDownloadProgress: (progressEvent) => {
      if (!firstByteRecorded) {
        firstByteRecorded = true;
        timestamps.firstByte = Date.now();
      }
    },
  };

  function getTimings(): TimingData {
    const now = Date.now();
    // Ensure timestamps have fallbacks
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

  return { config: timedConfig, getTimings };
}
