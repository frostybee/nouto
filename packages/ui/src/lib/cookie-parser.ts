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
