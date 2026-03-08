/**
 * TauriCookieJarService - Cookie jar management for the Tauri desktop app.
 * Mirrors the core CookieJarService interface but persists to localStorage.
 */

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: number;
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

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

const STORAGE_KEY = 'hivefetch_cookie_jars';

export class TauriCookieJarService {
  private jars: CookieJar[] = [];
  private activeJarId: string | null = null;
  private loaded = false;

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Migration from old flat format
          const defaultJar: CookieJar = { id: generateId(), name: 'Default', cookies: parsed };
          this.jars = [defaultJar];
          this.activeJarId = defaultJar.id;
          this.save();
        } else if (parsed && Array.isArray(parsed.jars)) {
          this.jars = parsed.jars;
          this.activeJarId = parsed.activeJarId ?? null;
        }
      }
    } catch {
      this.jars = [];
      this.activeJarId = null;
    }

    if (this.jars.length === 0) {
      const defaultJar: CookieJar = { id: generateId(), name: 'Default', cookies: [] };
      this.jars = [defaultJar];
      this.activeJarId = defaultJar.id;
    }

    if (!this.activeJarId || !this.jars.find(j => j.id === this.activeJarId)) {
      this.activeJarId = this.jars[0].id;
    }

    this.loaded = true;
  }

  private ensureLoaded(): void {
    if (!this.loaded) this.load();
  }

  private save(): void {
    const data: CookieJarStorage = { jars: this.jars, activeJarId: this.activeJarId };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('[CookieJarService] Failed to save:', error);
    }
  }

  private getActiveJar(): CookieJar | null {
    if (!this.activeJarId) return null;
    return this.jars.find(j => j.id === this.activeJarId) ?? null;
  }

  // --- Jar CRUD ---

  createJar(name: string): CookieJar {
    this.ensureLoaded();
    const jar: CookieJar = { id: generateId(), name, cookies: [] };
    this.jars.push(jar);
    this.save();
    return jar;
  }

  renameJar(id: string, name: string): void {
    this.ensureLoaded();
    const jar = this.jars.find(j => j.id === id);
    if (jar) {
      jar.name = name;
      this.save();
    }
  }

  deleteJar(id: string): void {
    this.ensureLoaded();
    if (this.jars.length <= 1) return;
    this.jars = this.jars.filter(j => j.id !== id);
    if (this.activeJarId === id) {
      this.activeJarId = this.jars[0]?.id ?? null;
    }
    this.save();
  }

  listJars(): CookieJarInfo[] {
    this.ensureLoaded();
    return this.jars.map(j => ({ id: j.id, name: j.name, cookieCount: j.cookies.length }));
  }

  getActiveJarId(): string | null {
    this.ensureLoaded();
    return this.activeJarId;
  }

  setActiveJar(id: string | null): void {
    this.ensureLoaded();
    if (id === null || this.jars.find(j => j.id === id)) {
      this.activeJarId = id;
      this.save();
    }
  }

  // --- Cookie CRUD (operates on active jar) ---

  addCookie(cookie: Cookie): void {
    this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    jar.cookies = jar.cookies.filter(
      c => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
    );
    jar.cookies.push(cookie);
    this.save();
  }

  updateCookie(oldName: string, oldDomain: string, oldPath: string, cookie: Cookie): void {
    this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    const idx = jar.cookies.findIndex(
      c => c.name === oldName && c.domain === oldDomain && c.path === oldPath
    );
    if (idx >= 0) {
      jar.cookies[idx] = cookie;
      this.save();
    }
  }

  // --- Cookie operations ---

  storeFromResponse(responseHeaders: Record<string, string>, requestUrl: string): void {
    this.ensureLoaded();
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
        jar.cookies = jar.cookies.filter(
          c => !(c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path)
        );
        jar.cookies.push(cookie);
      }
    }

    // Remove expired cookies
    const now = Date.now();
    jar.cookies = jar.cookies.filter(c => !c.expires || c.expires > now);
    this.save();
  }

  getCookiesForUrl(url: string): Cookie[] {
    this.ensureLoaded();
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

  buildCookieHeader(url: string): string {
    const cookies = this.getCookiesForUrl(url);
    if (cookies.length === 0) return '';
    return cookies.map(c => `${c.name}=${c.value}`).join('; ');
  }

  getAllByDomain(): Record<string, Cookie[]> {
    this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return {};
    const grouped: Record<string, Cookie[]> = {};
    for (const c of jar.cookies) {
      if (!grouped[c.domain]) grouped[c.domain] = [];
      grouped[c.domain].push(c);
    }
    return grouped;
  }

  deleteCookie(name: string, domain: string, cookiePath: string): void {
    this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    jar.cookies = jar.cookies.filter(
      c => !(c.name === name && c.domain === domain && c.path === cookiePath)
    );
    this.save();
  }

  deleteDomain(domain: string): void {
    this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    jar.cookies = jar.cookies.filter(c => c.domain !== domain);
    this.save();
  }

  clearAll(): void {
    this.ensureLoaded();
    const jar = this.getActiveJar();
    if (!jar) return;
    jar.cookies = [];
    this.save();
  }

  // --- Private helpers ---

  private extractSetCookieHeaders(headers: Record<string, string>): string[] {
    const result: string[] = [];
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        // Could be comma-separated (multiple Set-Cookie values merged)
        const cookies = value.split(/,(?=\s*\w+=)/);
        result.push(...cookies.map(c => c.trim()));
      }
    }
    return result;
  }

  private parseSetCookie(header: string, requestUrl: URL): Cookie | null {
    const parts = header.split(';').map(p => p.trim());
    if (parts.length === 0) return null;

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
          if (!isNaN(date.getTime())) cookie.expires = date.getTime();
          break;
        }
        case 'max-age': {
          const seconds = parseInt(attrValue, 10);
          if (!isNaN(seconds)) cookie.expires = Date.now() + seconds * 1000;
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
    if (hostname.endsWith('.' + cookieDomain)) return true;
    return false;
  }
}
