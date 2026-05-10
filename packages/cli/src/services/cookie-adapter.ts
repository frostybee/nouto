import type { CookieContext, ScriptCookie } from '@nouto/core/services';

export class CliCookieContext implements CookieContext {
  private cookies: ScriptCookie[] = [];

  async getAll(): Promise<ScriptCookie[]> {
    return [...this.cookies];
  }

  async getCookiesForUrl(url: string): Promise<ScriptCookie[]> {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return [];
    }

    return this.cookies.filter(c => {
      const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
      return hostname === domain || hostname.endsWith('.' + domain);
    });
  }

  async setCookie(cookie: ScriptCookie): Promise<void> {
    const idx = this.cookies.findIndex(
      c => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path,
    );
    if (idx >= 0) {
      this.cookies[idx] = cookie;
    } else {
      this.cookies.push(cookie);
    }
  }

  async deleteCookie(domain: string, name: string): Promise<void> {
    this.cookies = this.cookies.filter(c => !(c.domain === domain && c.name === name));
  }

  async clearAll(): Promise<void> {
    this.cookies = [];
  }

  injectCookieHeader(url: string, headers: Record<string, string>): void {
    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return;
    }

    const matching = this.cookies.filter(c => {
      const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
      return hostname === domain || hostname.endsWith('.' + domain);
    });

    if (matching.length > 0) {
      const cookieStr = matching.map(c => `${c.name}=${c.value}`).join('; ');
      headers['Cookie'] = headers['Cookie'] ? headers['Cookie'] + '; ' + cookieStr : cookieStr;
    }
  }

  parseSetCookieHeaders(url: string, headers: Record<string, string>): void {
    const setCookieValues: string[] = [];
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === 'set-cookie') {
        setCookieValues.push(...value.split(/,(?=\s*\w+=)/));
      }
    }

    let hostname: string;
    try {
      hostname = new URL(url).hostname;
    } catch {
      return;
    }

    for (const raw of setCookieValues) {
      const parts = raw.split(';').map(p => p.trim());
      const nameValue = parts[0];
      if (!nameValue) continue;
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx === -1) continue;

      const cookie: ScriptCookie = {
        name: nameValue.slice(0, eqIdx),
        value: nameValue.slice(eqIdx + 1),
        domain: hostname,
        path: '/',
      };

      for (const attr of parts.slice(1)) {
        const lower = attr.toLowerCase();
        if (lower.startsWith('domain=')) cookie.domain = attr.slice(7);
        else if (lower.startsWith('path=')) cookie.path = attr.slice(5);
        else if (lower === 'httponly') cookie.httpOnly = true;
        else if (lower === 'secure') cookie.secure = true;
        else if (lower.startsWith('samesite=')) cookie.sameSite = attr.slice(9) as ScriptCookie['sameSite'];
      }

      this.setCookie(cookie);
    }
  }
}
