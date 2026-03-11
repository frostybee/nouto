import type { Collection, SavedRequest, Folder, KeyValue, BodyState, HttpMethod } from '../types';
import { generateId } from '../types';

// HAR 1.2 Types (simplified)
interface HarLog {
  log: {
    version?: string;
    entries: HarEntry[];
  };
}

interface HarEntry {
  request: {
    method: string;
    url: string;
    headers: Array<{ name: string; value: string }>;
    queryString: Array<{ name: string; value: string }>;
    postData?: {
      mimeType?: string;
      text?: string;
      params?: Array<{ name: string; value: string }>;
    };
  };
}

export class HarImportService {
  importFromString(content: string): { collection: Collection } {
    let data: HarLog;
    try {
      data = JSON.parse(content);
    } catch {
      throw new Error('Invalid HAR file: content is not valid JSON');
    }

    if (!data.log?.entries || !Array.isArray(data.log.entries)) {
      throw new Error('Invalid HAR file: missing log.entries array');
    }

    const now = new Date().toISOString();

    // Group entries by domain into folders
    const domainMap = new Map<string, SavedRequest[]>();
    let requestIndex = 0;

    for (const entry of data.log.entries) {
      const request = this.convertEntry(entry, now, ++requestIndex);
      let domain: string;
      try {
        domain = new URL(entry.request.url).hostname;
      } catch {
        domain = 'Unknown';
      }
      if (!domainMap.has(domain)) {
        domainMap.set(domain, []);
      }
      domainMap.get(domain)!.push(request);
    }

    // Build collection items
    const items: (SavedRequest | Folder)[] = [];

    if (domainMap.size === 1) {
      // Single domain: put requests at root
      for (const requests of domainMap.values()) {
        items.push(...requests);
      }
    } else {
      // Multiple domains: create folder per domain
      for (const [domain, requests] of domainMap) {
        items.push({
          type: 'folder',
          id: generateId(),
          name: domain,
          children: requests,
          expanded: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const collection: Collection = {
      id: generateId(),
      name: `HAR Import (${data.log.entries.length} requests)`,
      items,
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };

    return { collection };
  }

  private convertEntry(entry: HarEntry, now: string, index: number): SavedRequest {
    const req = entry.request;
    const method = (req.method?.toUpperCase() || 'GET') as HttpMethod;

    // Parse URL without query string (HAR provides queryString separately)
    let cleanUrl = req.url;
    try {
      const urlObj = new URL(req.url);
      urlObj.search = '';
      cleanUrl = urlObj.toString().replace(/\/$/, '') || req.url;
    } catch {
      // Keep original URL if parsing fails
    }

    // Headers (skip pseudo-headers and cookie headers)
    const skipHeaders = new Set([':method', ':path', ':scheme', ':authority', 'cookie']);
    const headers: KeyValue[] = (req.headers || [])
      .filter(h => !skipHeaders.has(h.name.toLowerCase()))
      .map(h => ({
        id: generateId(),
        key: h.name,
        value: h.value,
        enabled: true,
      }));

    // Query params
    const params: KeyValue[] = (req.queryString || []).map(q => ({
      id: generateId(),
      key: q.name,
      value: q.value,
      enabled: true,
    }));

    // Body
    const body: BodyState = this.convertBody(req.postData);

    // Name from URL path
    let name: string;
    try {
      const urlObj = new URL(req.url);
      const pathPart = urlObj.pathname === '/' ? urlObj.hostname : urlObj.pathname;
      name = `${method} ${pathPart}`;
    } catch {
      name = `Request ${index}`;
    }

    return {
      type: 'request',
      id: generateId(),
      name,
      method,
      url: cleanUrl,
      params,
      headers,
      auth: { type: 'none' },
      body,
      createdAt: now,
      updatedAt: now,
    };
  }

  private convertBody(postData?: HarEntry['request']['postData']): BodyState {
    if (!postData) {
      return { type: 'none', content: '' };
    }

    const mime = (postData.mimeType || '').toLowerCase();

    // Check multipart first since it may have params but no text
    if (mime.includes('multipart/form-data')) {
      if (postData.params && postData.params.length > 0) {
        const formData = postData.params.map(p => ({ name: p.name, value: p.value, type: 'text' as const }));
        return { type: 'form-data', content: JSON.stringify(formData) };
      }
      if (postData.text) return { type: 'text', content: postData.text };
      return { type: 'none', content: '' };
    }

    if (!postData.text) {
      return { type: 'none', content: '' };
    }

    if (mime.includes('json')) {
      return { type: 'json', content: postData.text };
    }
    if (mime.includes('x-www-form-urlencoded')) {
      return { type: 'x-www-form-urlencoded', content: postData.text };
    }
    if (mime.includes('xml') || mime.includes('html')) {
      return { type: 'text', content: postData.text };
    }

    return { type: 'text', content: postData.text };
  }
}
