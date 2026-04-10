import * as fs from 'fs';
import * as path from 'path';
import { generateId } from '../types';

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

export interface CookieJar {
  id: string;
  name: string;
  cookies: Cookie[];
}

export interface CookieJarInfo {
  id: string;
  name: string;
  cookieCount: number;
}

interface CookieJarStorage {
  jars: CookieJar[];
  activeJarId: string | null;
}

/**
 * Persistent cookie jar service that supports multiple named cookie jars.
 * Cookies are persisted to `.vscode/nouto/cookies.json`.
 */
export class CookieJarService {
  private jars: CookieJar[] = [];
  private activeJarId: string | null = null;
  private filePath: string;
  private loaded = false;

  constructor(storageDir: string) {
    this.filePath = path.join(storageDir, 'cookies.json');
  }

  async load(): Promise<void> {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = await fs.promises.readFile(this.filePath, 'utf-8');
        const parsed = JSON.parse(data);

        // Migration: old format was a flat Cookie[] array
        if (Array.isArray(parsed)) {
          const defaultJar: CookieJar = {
            id: generateId(),
            name: 'Default',
            cookies: parsed,
          };
          this.jars = [defaultJar];
          this.activeJarId = defaultJar.id;
          // Persist the migrated format
          await this.save();
        } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.jars)) {
          this.jars = parsed.jars;
          this.activeJarId = parsed.activeJarId ?? null;
        } else {
          this.jars = [];
          this.activeJarId = null;
        }
      }
    } catch {
      this.jars = [];
      this.activeJarId = null;
    }

    // Ensure at least one jar exists
    if (this.jars.length === 0) {
      const defaultJar: CookieJar = {
        id: generateId(),
        name: 'Default',
        cookies: [],
      };
      this.jars = [defaultJar];
      this.activeJarId = defaultJar.id;
    }

    // Ensure activeJarId points to a valid jar
    if (!this.activeJarId || !this.jars.find(j => j.id === this.activeJarId)) {
      this.activeJarId = this.jars[0].id;
    }

    this.loaded = true;
  }

  async reload(): Promise<void> {
    this.loaded = false;
    await this.load();
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) await this.load();
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    const data: CookieJarStorage = {
      jars: this.jars,
      activeJarId: this.activeJarId,
    };
    await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private getActiveJar(): CookieJar | null {
    if (!this.activeJarId) return null;
    return this.jars.find(j => j.id === this.activeJarId) ?? null;
  }

  // --- Jar CRUD ---

  /**
   * Create a new cookie jar with the given name.
   */
  async createJar(name: string): Promise<CookieJar> {
    await this.ensureLoaded();
    const jar: CookieJar = {
      id: generateId(),
      name,
      cookies: [],
    };
    this.jars.push(jar);
    await this.save();
    return jar;
  }

  /**
   * Rename a cookie jar.
   */
  async renameJar(id: string, name: string): Promise<void> {
    await this.ensureLoaded();
    const jar = this.jars.find(j => j.id === id);
    if (jar) {
      jar.name = name;
      await this.save();
    }
  }

  /**
   * Delete a cookie jar. Prevents deleting the last jar.
   */
  async deleteJar(id: string): Promise<void> {
    await this.ensureLoaded();
    if (this.jars.length <= 1) return; // prevent deleting last jar
    this.jars = this.jars.filter(j => j.id !== id);
    // If we deleted the active jar, switch to the first remaining jar
    if (this.activeJarId === id) {
      this.activeJarId = this.jars[0]?.id ?? null;
    }
    await this.save();
  }

  /**
   * List all cookie jars with metadata.
   */
  async listJars(): Promise<CookieJarInfo[]> {
    await this.ensureLoaded();
    return this.jars.map(j => ({
      id: j.id,
      name: j.name,
      cookieCount: j.cookies.length,
    }));
  }

  /**
   * Get the active jar ID.
   */
  getActiveJarId(): string | null {
    return this.activeJarId;
  }

  /**
   * Set the active cookie jar.
   */
  async setActiveJar(id: string | null): Promise<void> {
    await this.ensureLoaded();
    if (id === null || this.jars.find(j => j.id === id)) {
      this.activeJarId = id;
      await this.save();
    }
  }

  // --- Cookie CRUD (operates on active jar) ---

  /**
   * Manually add a cookie to the active jar.
   */
  async addCookie(cookie: Cookie): Promise<void> {
    await this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    // Remove existing cookie with same name+domain+path
    jar.cookies = jar.cookies.filter(
      c => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
    );
    jar.cookies.push(cookie);
    await this.save();
  }

  /**
   * Update a cookie in the active jar, identified by its old name/domain/path.
   */
  async updateCookie(oldName: string, oldDomain: string, oldPath: string, cookie: Cookie): Promise<void> {
    await this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    const idx = jar.cookies.findIndex(
      c => c.name === oldName && c.domain === oldDomain && c.path === oldPath
    );
    if (idx >= 0) {
      jar.cookies[idx] = cookie;
      await this.save();
    }
  }

  // --- Cookie operations (operate on active jar) ---

  /**
   * Parse Set-Cookie headers from a response and store them in the active jar.
   */
  async storeFromResponse(responseHeaders: Record<string, string | string[]>, requestUrl: string): Promise<void> {
    await this.ensureLoaded();

    const jar = this.getActiveJar();
    if (!jar) return;

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
        jar.cookies = jar.cookies.filter(
          c => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
        );
        jar.cookies.push(cookie);
      }
    }

    // Remove expired cookies
    const now = Date.now();
    jar.cookies = jar.cookies.filter(c => !c.expires || c.expires > now);

    await this.save();
  }

  /**
   * Get cookies from the active jar that should be sent for a given URL.
   */
  async getCookiesForUrl(url: string): Promise<Cookie[]> {
    await this.ensureLoaded();

    const jar = this.getActiveJar();
    if (!jar) return [];

    let urlObj: URL;
    try {
      urlObj = new URL(url);
    } catch {
      return [];
    }

    const now = Date.now();
    return jar.cookies.filter(c => {
      if (c.expires && c.expires <= now) return false;
      if (!this.domainMatch(urlObj.hostname, c.domain)) return false;
      if (!urlObj.pathname.startsWith(c.path)) return false;
      if (c.secure && urlObj.protocol !== 'https:') return false;
      return true;
    });
  }

  /**
   * Build a Cookie header string for a given URL from the active jar.
   */
  async buildCookieHeader(url: string): Promise<string> {
    const cookies = await this.getCookiesForUrl(url);
    if (cookies.length === 0) return '';
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  /**
   * Get all stored cookies from the active jar.
   */
  async getAll(): Promise<Cookie[]> {
    await this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return [];
    return [...jar.cookies];
  }

  /**
   * Get cookies from the active jar grouped by domain.
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
   * Delete a specific cookie from the active jar by name, domain, and path.
   */
  async deleteCookie(name: string, domain: string, cookiePath: string): Promise<void> {
    await this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    jar.cookies = jar.cookies.filter(
      c => !(c.name === name && c.domain === domain && c.path === cookiePath)
    );
    await this.save();
  }

  /**
   * Delete all cookies for a specific domain from the active jar.
   */
  async deleteDomain(domain: string): Promise<void> {
    await this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    jar.cookies = jar.cookies.filter(c => c.domain !== domain);
    await this.save();
  }

  /**
   * Clear all cookies in the active jar.
   */
  async clearAll(): Promise<void> {
    await this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    jar.cookies = [];
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
