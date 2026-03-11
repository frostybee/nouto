import type { SavedRequest, CollectionItem, Folder } from '../types';
import { isFolder, isRequest } from '../types';

interface HarEntry {
  startedDateTime: string;
  time: number;
  request: {
    method: string;
    url: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    cookies: Array<{ name: string; value: string }>;
    headersSize: number;
    bodySize: number;
    postData?: {
      mimeType: string;
      text: string;
    };
  };
  response: {
    status: number;
    statusText: string;
    httpVersion: string;
    headers: Array<{ name: string; value: string }>;
    cookies: Array<{ name: string; value: string }>;
    content: { size: number; mimeType: string; text: string };
    redirectURL: string;
    headersSize: number;
    bodySize: number;
  };
  cache: Record<string, unknown>;
  timings: { send: number; wait: number; receive: number };
}

export class HarExportService {
  exportToHar(requests: SavedRequest[]): string {
    const entries: HarEntry[] = requests.map(req => this.convertToEntry(req));

    const har = {
      log: {
        version: '1.2',
        creator: {
          name: 'HiveFetch',
          version: '1.0',
        },
        entries,
      },
    };

    return JSON.stringify(har, null, 2);
  }

  exportCollectionItems(items: CollectionItem[]): string {
    const requests = this.flattenRequests(items);
    return this.exportToHar(requests);
  }

  private flattenRequests(items: CollectionItem[]): SavedRequest[] {
    const result: SavedRequest[] = [];
    for (const item of items) {
      if (isRequest(item)) {
        result.push(item);
      } else if (isFolder(item)) {
        result.push(...this.flattenRequests((item as Folder).children));
      }
    }
    return result;
  }

  private convertToEntry(req: SavedRequest): HarEntry {
    // Build full URL with query params
    const enabledParams = (req.params || []).filter(p => p.enabled);
    let fullUrl = req.url;
    if (enabledParams.length > 0) {
      const qs = enabledParams
        .map(p => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
        .join('&');
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + qs;
    }

    // Headers
    const headers = (req.headers || [])
      .filter(h => h.enabled && h.key)
      .map(h => ({ name: h.key, value: h.value }));

    // Query string
    const queryString = (req.params || [])
      .filter(p => p.enabled && p.key)
      .map(p => ({ name: p.key, value: p.value }));

    // Post data
    let postData: HarEntry['request']['postData'] | undefined;
    if (req.body && req.body.type !== 'none' && req.body.content) {
      const mimeTypes: Record<string, string> = {
        json: 'application/json',
        text: 'text/plain',
        xml: 'application/xml',
        graphql: 'application/json',
        'x-www-form-urlencoded': 'application/x-www-form-urlencoded',
        'form-data': 'multipart/form-data',
      };
      postData = {
        mimeType: mimeTypes[req.body.type] || 'text/plain',
        text: req.body.content,
      };
    }

    const headerText = headers.map(h => `${h.name}: ${h.value}\r\n`).join('');
    const bodySize = postData?.text?.length || 0;

    return {
      startedDateTime: new Date().toISOString(),
      time: 0,
      request: {
        method: req.method,
        url: fullUrl,
        httpVersion: 'HTTP/1.1',
        headers,
        queryString,
        cookies: [],
        headersSize: headerText.length,
        bodySize,
        ...(postData ? { postData } : {}),
      },
      response: {
        status: 0,
        statusText: '',
        httpVersion: 'HTTP/1.1',
        headers: [],
        cookies: [],
        content: { size: 0, mimeType: 'text/plain', text: '' },
        redirectURL: '',
        headersSize: 0,
        bodySize: 0,
      },
      cache: {},
      timings: { send: 0, wait: 0, receive: 0 },
    };
  }
}
