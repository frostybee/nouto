/**
 * Cookie parsing utilities
 */

export interface Cookie {
  name: string;
  value: string;
  attributes: Record<string, string>;
}

/**
 * Parse Set-Cookie headers from a headers object
 */
export function parseCookies(headers: Record<string, string>): Cookie[] {
  const cookies: Cookie[] = [];

  // Look for Set-Cookie header (case-insensitive)
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === 'set-cookie') {
      // Handle multiple cookies (could be comma-separated or array)
      const cookieStrings = value.split(/,(?=\s*\w+=)/);
      for (const cookieStr of cookieStrings) {
        const cookie = parseSingleCookie(cookieStr.trim());
        if (cookie) {
          cookies.push(cookie);
        }
      }
    }
  }

  return cookies;
}

/**
 * Parse a single Set-Cookie string into a Cookie object
 */
export function parseSingleCookie(cookieStr: string): Cookie | null {
  const parts = cookieStr.split(';').map((p) => p.trim());
  if (parts.length === 0) return null;

  // First part is name=value
  const [nameValue, ...attributeParts] = parts;
  const eqIndex = nameValue.indexOf('=');
  if (eqIndex === -1) return null;

  const name = nameValue.substring(0, eqIndex).trim();
  const value = nameValue.substring(eqIndex + 1).trim();

  // Parse attributes
  const attributes: Record<string, string> = {};
  for (const attr of attributeParts) {
    const attrEqIndex = attr.indexOf('=');
    if (attrEqIndex === -1) {
      // Flag attribute (e.g., HttpOnly, Secure)
      attributes[attr.toLowerCase()] = 'true';
    } else {
      const attrName = attr.substring(0, attrEqIndex).trim().toLowerCase();
      const attrValue = attr.substring(attrEqIndex + 1).trim();
      attributes[attrName] = attrValue;
    }
  }

  return { name, value, attributes };
}

/**
 * Parse the Cookie request header into name/value pairs.
 * The Cookie header format is: name1=value1; name2=value2
 */
export function parseSentCookies(
  requestHeaders?: Record<string, string>,
): Array<{ name: string; value: string }> {
  if (!requestHeaders) return [];

  // Find Cookie header (case-insensitive)
  let cookieHeader = '';
  for (const [key, value] of Object.entries(requestHeaders)) {
    if (key.toLowerCase() === 'cookie') {
      cookieHeader = value;
      break;
    }
  }

  if (!cookieHeader) return [];

  return cookieHeader
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.length > 0)
    .map((pair) => {
      const eqIndex = pair.indexOf('=');
      if (eqIndex === -1) return { name: pair, value: '' };
      return {
        name: pair.substring(0, eqIndex).trim(),
        value: pair.substring(eqIndex + 1).trim(),
      };
    });
}

/**
 * Check if a response cookie is a deletion cookie
 * (max-age is 0 or negative, or expires is in the past)
 */
export function isDeletedCookie(cookie: Cookie): boolean {
  const maxAge = cookie.attributes['max-age'];
  if (maxAge !== undefined) {
    const val = parseInt(maxAge, 10);
    if (!isNaN(val) && val <= 0) return true;
  }

  const expires = cookie.attributes.expires;
  if (expires) {
    try {
      const date = new Date(expires);
      if (date.getTime() < Date.now()) return true;
    } catch {
      // ignore invalid dates
    }
  }

  return false;
}

/**
 * Check if a response cookie is a session cookie (no expiry set)
 */
export function isSessionCookie(cookie: Cookie): boolean {
  return !cookie.attributes.expires && !cookie.attributes['max-age'];
}

/**
 * Format a cookie expiry date string to a locale string
 */
export function formatExpiry(expiry: string): string {
  try {
    const date = new Date(expiry);
    return date.toLocaleString();
  } catch {
    return expiry;
  }
}
