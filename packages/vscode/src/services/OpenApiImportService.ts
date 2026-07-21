import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as http from 'http';
import * as https from 'https';
import type { Collection, Environment } from './types';
import { OpenApiImportService as CoreOpenApiImportService } from '@nouto/core/services';
import type { OpenApiFormat } from '@nouto/core/services';

// ============================================
// OpenAPI Import Service (VS Code platform adapter)
//
// All parsing/conversion logic lives in @nouto/core's OpenApiImportService.
// This adapter only contributes platform-specific loading: file reads via
// fs/promises and SSRF-protected URL fetching.
// ============================================

export class OpenApiImportService {
  private core = new CoreOpenApiImportService();

  async importFromFile(uri: vscode.Uri): Promise<{ collection: Collection; variables?: Environment }> {
    const content = await fs.readFile(uri.fsPath, 'utf8');
    const format: OpenApiFormat = this.hasYamlExtension(uri.fsPath) ? 'yaml' : 'json';
    return this.core.importFromString(content, format);
  }

  async importFromUrl(url: string): Promise<{ collection: Collection; variables?: Environment }> {
    const content = await this.fetchText(url);
    // Extension wins; otherwise core auto-detects from content.
    const format: OpenApiFormat | undefined = this.hasYamlExtension(url) ? 'yaml' : undefined;
    return this.core.importFromString(content, format);
  }

  private hasYamlExtension(pathOrUrl: string): boolean {
    return pathOrUrl.endsWith('.yaml') || pathOrUrl.endsWith('.yml');
  }

  private isPrivateUrl(urlStr: string): boolean {
    try {
      const parsed = new URL(urlStr);
      const hostname = parsed.hostname.toLowerCase();

      // Block localhost variants
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
        return true;
      }

      // Block private IP ranges (RFC 1918, link-local, loopback)
      const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
      if (ipMatch) {
        const [, a, b] = ipMatch.map(Number);
        if (a === 10) return true;                          // 10.0.0.0/8
        if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
        if (a === 192 && b === 168) return true;             // 192.168.0.0/16
        if (a === 169 && b === 254) return true;             // 169.254.0.0/16
        if (a === 127) return true;                          // 127.0.0.0/8
        if (a === 0) return true;                            // 0.0.0.0/8
      }

      // Block non-http protocols
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return true;
      }

      return false;
    } catch {
      return true;
    }
  }

  private fetchText(url: string, redirectCount = 0): Promise<string> {
    const MAX_REDIRECTS = 5;
    return new Promise((resolve, reject) => {
      if (this.isPrivateUrl(url)) {
        reject(new Error('Blocked: URL points to a private/internal network address'));
        return;
      }

      const requestFn = url.startsWith('https:') ? https.get : http.get;
      const req = requestFn(url, { timeout: 30000 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (redirectCount >= MAX_REDIRECTS) {
            reject(new Error('Too many redirects'));
            return;
          }
          this.fetchText(res.headers.location, redirectCount + 1).then(resolve, reject);
          return;
        }
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(new Error('Request timed out')); });
    });
  }
}
