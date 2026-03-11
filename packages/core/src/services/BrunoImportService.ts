import type { Collection, SavedRequest, Folder, KeyValue, AuthState, BodyState, HttpMethod } from '../types';
import { generateId } from '../types';

/**
 * Import Bruno (.bru) collections.
 * Bruno stores each request as a .bru file in a folder tree.
 * The .bru format is a line-oriented text format with { } blocks.
 *
 * Example:
 *   meta {
 *     name: Get Users
 *     type: http
 *     seq: 1
 *   }
 *   get {
 *     url: https://api.example.com/users
 *   }
 *   headers {
 *     Authorization: Bearer {{token}}
 *     Content-Type: application/json
 *   }
 *   body:json {
 *     {"name":"test"}
 *   }
 *   auth:bearer {
 *     token: my-token
 *   }
 */

interface BruBlock {
  name: string;
  content: string;
  keyValues: Map<string, string>;
  disabledKeys: Set<string>;
}

export class BrunoImportService {
  /**
   * Import from a map of file paths to file contents.
   * Keys are relative paths like "folder/Get Users.bru", values are file contents.
   */
  importFromFiles(files: Map<string, string>): { collection: Collection } {
    const now = new Date().toISOString();

    // Build folder tree from file paths
    const root: Map<string, any> = new Map();
    const requests: Array<{ path: string[]; request: SavedRequest }> = [];

    for (const [filePath, content] of files) {
      if (!filePath.endsWith('.bru')) continue;

      const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
      const fileName = parts.pop()!;
      const folderPath = parts;

      try {
        const request = this.parseBruFile(content, fileName.replace('.bru', ''), now);
        requests.push({ path: folderPath, request });
      } catch {
        // Skip unparseable files
      }
    }

    // Build nested folder structure
    const items = this.buildTree(requests, now);

    const collection: Collection = {
      id: generateId(),
      name: 'Bruno Import',
      items,
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };

    return { collection };
  }

  /**
   * Import from a single .bru file string content
   */
  importFromString(content: string, name = 'Bruno Request'): { collection: Collection } {
    const now = new Date().toISOString();
    const request = this.parseBruFile(content, name, now);

    const collection: Collection = {
      id: generateId(),
      name: 'Bruno Import',
      items: [request],
      expanded: true,
      createdAt: now,
      updatedAt: now,
    };

    return { collection };
  }

  private parseBruFile(content: string, defaultName: string, now: string): SavedRequest {
    const blocks = this.parseBlocks(content);

    // Extract metadata
    const meta = blocks.find(b => b.name === 'meta');
    const name = meta?.keyValues.get('name') || defaultName;

    // Extract method and URL
    const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
    const methodBlock = blocks.find(b => httpMethods.includes(b.name));
    const method = (methodBlock?.name?.toUpperCase() || 'GET') as HttpMethod;
    const url = methodBlock?.keyValues.get('url') || '';

    // Extract headers
    const headerBlock = blocks.find(b => b.name === 'headers');
    const headers: KeyValue[] = [];
    if (headerBlock) {
      for (const [key, value] of headerBlock.keyValues) {
        headers.push({
          id: generateId(),
          key,
          value,
          enabled: !headerBlock.disabledKeys.has(key),
        });
      }
    }

    // Extract query params
    const queryBlock = blocks.find(b => b.name === 'query' || b.name === 'params:query');
    const params: KeyValue[] = [];
    if (queryBlock) {
      for (const [key, value] of queryBlock.keyValues) {
        params.push({
          id: generateId(),
          key,
          value,
          enabled: !queryBlock.disabledKeys.has(key),
        });
      }
    }

    // Extract body
    const body = this.extractBody(blocks);

    // Extract auth
    const auth = this.extractAuth(blocks);

    return {
      type: 'request',
      id: generateId(),
      name,
      method,
      url,
      params,
      headers,
      auth,
      body,
      createdAt: now,
      updatedAt: now,
    };
  }

  private parseBlocks(content: string): BruBlock[] {
    const blocks: BruBlock[] = [];
    const lines = content.split('\n');
    let i = 0;

    while (i < lines.length) {
      const line = lines[i].trim();

      // Match block opener: "blockname {" or "blockname:subtype {"
      const blockMatch = line.match(/^([\w:.-]+)\s*\{$/);
      if (blockMatch) {
        const blockName = blockMatch[1];
        const contentLines: string[] = [];
        const keyValues = new Map<string, string>();
        const disabledKeys = new Set<string>();
        i++;

        // Read until closing brace
        while (i < lines.length) {
          const blockLine = lines[i];
          if (blockLine.trim() === '}') {
            break;
          }

          contentLines.push(blockLine);

          // Try to parse key-value pairs ("key: value" or "~key: value" for disabled)
          const kvMatch = blockLine.match(/^\s*(~?)([\w-]+)\s*:\s*(.*)$/);
          if (kvMatch) {
            const isDisabled = kvMatch[1] === '~';
            const key = kvMatch[2];
            keyValues.set(key, kvMatch[3].trim());
            if (isDisabled) {
              disabledKeys.add(key);
            }
          }

          i++;
        }

        blocks.push({
          name: blockName,
          content: contentLines.join('\n').trim(),
          keyValues,
          disabledKeys,
        });
      }

      i++;
    }

    return blocks;
  }

  private extractBody(blocks: BruBlock[]): BodyState {
    const jsonBody = blocks.find(b => b.name === 'body:json');
    if (jsonBody) {
      return { type: 'json', content: jsonBody.content };
    }

    const textBody = blocks.find(b => b.name === 'body:text');
    if (textBody) {
      return { type: 'text', content: textBody.content };
    }

    const xmlBody = blocks.find(b => b.name === 'body:xml');
    if (xmlBody) {
      return { type: 'xml', content: xmlBody.content };
    }

    const formBody = blocks.find(b => b.name === 'body:form-urlencoded');
    if (formBody) {
      const items = Array.from(formBody.keyValues.entries()).map(([key, value]) => ({
        id: generateId(), key, value, enabled: !formBody.disabledKeys.has(key),
      }));
      return { type: 'x-www-form-urlencoded', content: JSON.stringify(items) };
    }

    const multipartBody = blocks.find(b => b.name === 'body:multipart-form');
    if (multipartBody) {
      const formData = Array.from(multipartBody.keyValues.entries()).map(([key, value]) => ({
        name: key,
        value,
        type: 'text' as const,
      }));
      return { type: 'form-data', content: JSON.stringify(formData) };
    }

    const graphqlBody = blocks.find(b => b.name === 'body:graphql');
    if (graphqlBody) {
      const varsBlock = blocks.find(b => b.name === 'body:graphql:vars');
      return {
        type: 'graphql',
        content: graphqlBody.content,
        graphqlVariables: varsBlock?.content || '',
      };
    }

    return { type: 'none', content: '' };
  }

  private extractAuth(blocks: BruBlock[]): AuthState {
    const bearerBlock = blocks.find(b => b.name === 'auth:bearer');
    if (bearerBlock) {
      return {
        type: 'bearer',
        token: bearerBlock.keyValues.get('token') || '',
      };
    }

    const basicBlock = blocks.find(b => b.name === 'auth:basic');
    if (basicBlock) {
      return {
        type: 'basic',
        username: basicBlock.keyValues.get('username') || '',
        password: basicBlock.keyValues.get('password') || '',
      };
    }

    const apiKeyBlock = blocks.find(b => b.name === 'auth:apikey');
    if (apiKeyBlock) {
      return {
        type: 'apikey',
        apiKeyName: apiKeyBlock.keyValues.get('key') || '',
        apiKeyValue: apiKeyBlock.keyValues.get('value') || '',
        apiKeyIn: (apiKeyBlock.keyValues.get('placement') as 'header' | 'query') || 'header',
      };
    }

    return { type: 'none' };
  }

  private buildTree(
    requests: Array<{ path: string[]; request: SavedRequest }>,
    now: string
  ): (SavedRequest | Folder)[] {
    // Group by top-level folder
    const rootItems: (SavedRequest | Folder)[] = [];
    const folderMap = new Map<string, { path: string[]; request: SavedRequest }[]>();

    for (const entry of requests) {
      if (entry.path.length === 0) {
        rootItems.push(entry.request);
      } else {
        const topFolder = entry.path[0];
        if (!folderMap.has(topFolder)) {
          folderMap.set(topFolder, []);
        }
        folderMap.get(topFolder)!.push({
          path: entry.path.slice(1),
          request: entry.request,
        });
      }
    }

    for (const [folderName, children] of folderMap) {
      const folder: Folder = {
        type: 'folder',
        id: generateId(),
        name: folderName,
        children: this.buildTree(children, now),
        expanded: false,
        createdAt: now,
        updatedAt: now,
      };
      rootItems.push(folder);
    }

    return rootItems;
  }
}
