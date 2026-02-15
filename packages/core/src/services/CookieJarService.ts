import * as fs from 'fs';
import * as path from 'path';

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number; // epoch ms, undefined = session
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  createdAt: number;
}

/**
 * Persistent cookie jar that stores cookies per domain.
 * Cookies are persisted to `.vscode/hivefetch/cookies.json`.
 */
export class CookieJarService {
  private cookies: Cookie[] = [];
  private filePath: string;
  private loaded = false;

  constructor(storageDir: string) {
    this.filePath = path.join(storageDir, 'cookies.json');
  }

  async load(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = await fs.promises.readFile(this.filePath, 'utf-8');
        this.cookies = JSON.parse(data);
      }
    } catch {
      this.cookies = [];
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    await fs.promises.writeFile(this.filePath, JSON.stringify(this.cookies, null, 2), 'utf-8');
  }

  /**
   * Parse Set-Cookie headers from a response and store them.
   */
  async storeFromResponse(responseHeaders: Record<string, string | string[]>, requestUrl: string): Promise<void> {
    if (!this.loaded) await this.load();

    const setCookieHeaders = this.extractSetCookieHeaders(responseHeaders);
    if (setCookieHeaders.length === 0) return;

    let urlObj: URL;
    try {
      urlObj = new URL(requestUrl);
    } catch {
      return;
    }

    for (const header of setCookieHeaders) {
      const cookie = this.parseSetCookie(header, urlObj);
      if (cookie) {
        // Remove existing cookie with same name+domain+path
        this.cookies = this.cookies.filter(
          c => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
        );
        this.cookies.push(cookie);
      }
    }

    // Remove expired cookies
    const now = Date.now();
    this.cookies = this.cookies.filter(c => !c.expires || c.expires > now);

    await this.save();
  }

  /**
   * Get cookies that should be sent for a given URL.
   */
  async getCookiesForUrl(url: string): Promise<Cookie[]> {
    if (!this.loaded) await this.load();

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return [];
    }

    const now = Date.now();
    return this.cookies.filter(c => {
      // Check expiry
      if (c.expires && c.expires <= now) return false;
      // Check domain match
      if (!this.domainMatch(urlObj.hostname, c.domain)) return false;
      // Check path match
      if (!urlObj.pathname.startsWith(c.path)) return false;
      // Check secure flag
      if (c.secure && urlObj.protocol !== 'https:') return false;
      return true;
    });
  }

  /**
   * Build a Cookie header string for a given URL.
   */
  async buildCookieHeader(url: string): Promise<string> {
    const cookies = await this.getCookiesForUrl(url);
    if (cookies.length === 0) return '';
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Get all stored cookies (for UI display).
   */
  async getAll(): Promise<Cookie[]> {
    if (!this.loaded) await this.load();
    return [...this.cookies];
  }

  /**
   * Get cookies grouped by domain.
   */
  async getAllByDomain(): Promise<Record<string, Cookie[]>> {
    const all = await this.getAll();
    const grouped: Record<string, Cookie[]> = {};
    for (const c of all) {
      if (!grouped[c.domain]) grouped[c.domain] = [];
      grouped[c.domain].push(c);
    }
    return grouped;
  }

  /**
   * Delete a specific cookie by name and domain.
   */
  async deleteCookie(name: string, domain: string, cookiePath: string): Promise<void> {
    if (!this.loaded) await this.load();
    this.cookies = this.cookies.filter(
      c => !(c.name === name && c.domain === domain && c.path === cookiePath)
    );
    await this.save();
  }

  /**
   * Delete all cookies for a specific domain.
   */
  async deleteDomain(domain: string): Promise<void> {
    if (!this.loaded) await this.load();
    this.cookies = this.cookies.filter(c => c.domain !== domain);
    await this.save();
  }

  /**
   * Clear all cookies.
   */
  async clearAll(): Promise<void> {
    this.cookies = [];
    await this.save();
  }

  private extractSetCookieHeaders(headers: Record<string, string | string[]>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        if (Array.isArray(value)) {
          result.push(...value);
        } else if (typeof value === 'string') {
          result.push(value);
        }
      }
    }
    return result;
  }

  parseSetCookie(header: string, requestUrl: URL): Cookie | null {
    const parts = header.split(';').map(p => p.trim());
    if (parts.length === 0) return null;

    // First part is name=value
    const firstPart = parts[0];
    const eqIndex = firstPart.indexOf('=');
    if (eqIndex < 1) return null;

    const name = firstPart.substring(0, eqIndex).trim();
    const value = firstPart.substring(eqIndex + 1).trim();

    const cookie: Cookie = {
      name,
      value,
      domain: requestUrl.hostname,
      path: '/',
      httpOnly: false,
      secure: false,
      createdAt: Date.now(),
    };

    // Parse attributes
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      const attrEq = part.indexOf('=');
      const attrName = (attrEq >= 0 ? part.substring(0, attrEq) : part).trim().toLowerCase();
      const attrValue = attrEq >= 0 ? part.substring(attrEq + 1).trim() : '';

      switch (attrName) {
        case 'domain':
          cookie.domain = attrValue.startsWith('.') ? attrValue.substring(1) : attrValue;
          break;
        case 'path':
          cookie.path = attrValue || '/';
          break;
        case 'expires': {
          const date = new Date(attrValue);
          if (!isNaN(date.getTime())) {
            cookie.expires = date.getTime();
          }
          break;
        }
        case 'max-age': {
          const seconds = parseInt(attrValue, 10);
          if (!isNaN(seconds)) {
            cookie.expires = Date.now() + seconds * 1000;
          }
          break;
        }
        case 'httponly':
          cookie.httpOnly = true;
          break;
        case 'secure':
          cookie.secure = true;
          break;
        case 'samesite':
          cookie.sameSite = attrValue as Cookie['sameSite'];
          break;
      }
    }

    return cookie;
  }

  private domainMatch(hostname: string, cookieDomain: string): boolean {
    if (hostname === cookieDomain) return true;
    // Allow subdomain matching: foo.example.com matches example.com
    if (hostname.endsWith('.' + cookieDomain)) return true;
    return false;
  }
}
