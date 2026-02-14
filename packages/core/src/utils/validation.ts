// URL and request validation utilities

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a URL string for use in HTTP requests
 */
export function validateUrl(url: string): ValidationResult {
  // Empty check
  if (!url || !url.trim()) {
    return { valid: false, error: 'URL is required' };
  }

  const trimmedUrl = url.trim();

  // Check for variable placeholders ({{var}}) - allow these to pass through
  // They will be substituted before the request is sent
  const hasVariables = /\{\{[^}]+\}\}/.test(trimmedUrl);

  // If the URL is entirely a variable placeholder, it's valid
  if (/^\{\{[^}]+\}\}$/.test(trimmedUrl)) {
    return { valid: true };
  }

  // Replace variable placeholders with dummy values for URL parsing
  const urlForParsing = trimmedUrl.replace(/\{\{[^}]+\}\}/g, 'placeholder');

  // Check for protocol (http, https, ws, wss)
  if (!/^(https?|wss?):\/\//i.test(urlForParsing)) {
    // Allow URLs without protocol (will be treated as http)
    // But validate the rest of the URL
    const withProtocol = 'http://' + urlForParsing;
    return validateUrlFormat(withProtocol, hasVariables);
  }

  // For ws/wss URLs, convert to http/https for URL parsing validation
  if (/^wss?:\/\//i.test(urlForParsing)) {
    const httpUrl = urlForParsing.replace(/^ws(s?):\/\//i, 'http$1://');
    return validateUrlFormat(httpUrl, hasVariables);
  }

  return validateUrlFormat(urlForParsing, hasVariables);
}

function validateUrlFormat(url: string, hasVariables: boolean): ValidationResult {
  try {
    const parsed = new URL(url);

    // Check for valid hostname
    if (!parsed.hostname) {
      return { valid: false, error: 'Invalid hostname' };
    }

    // Check for localhost or IP addresses
    const isLocalhost = parsed.hostname === 'localhost';
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(parsed.hostname);

    // For regular hostnames, check for valid domain format
    if (!isLocalhost && !isIP && !hasVariables) {
      // Must have at least one dot or be a valid single-word host
      const hostParts = parsed.hostname.split('.');
      if (hostParts.length === 1 && hostParts[0].length < 2) {
        return { valid: false, error: 'Invalid hostname' };
      }
    }

    // Check for spaces in the URL (excluding query string which allows encoded spaces)
    const pathAndSearch = parsed.pathname + parsed.search;
    if (pathAndSearch.includes(' ')) {
      return { valid: false, error: 'URL contains invalid spaces' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Checks if a URL might be incomplete (user is still typing)
 */
export function isIncompleteUrl(url: string): boolean {
  if (!url || url.length < 3) return true;

  // Check if URL ends with protocol separator
  if (url.endsWith('://') || url.endsWith(':/')) return true;

  // Check if URL ends with a dot (domain being typed)
  if (url.endsWith('.')) return true;

  return false;
}

/**
 * Suggests a fix for common URL issues
 */
export function suggestUrlFix(url: string): string | null {
  if (!url) return null;

  const trimmed = url.trim();

  // Fix malformed protocol (single slash instead of double)
  // e.g., "http:/example.com" -> "http://example.com"
  const malformedProtocol = trimmed.match(/^(https?:)\/?([^/].*)$/i);
  if (malformedProtocol) {
    const [, protocol, rest] = malformedProtocol;
    // Only suggest if the current URL doesn't already have correct double slashes
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
      return `${protocol.toLowerCase()}//${rest}`;
    }
  }

  // Missing protocol - suggest https:// (or wss:// for ws-looking URLs)
  if (trimmed && !trimmed.startsWith('http://') && !trimmed.startsWith('https://') && !trimmed.startsWith('ws://') && !trimmed.startsWith('wss://')) {
    // Check if it looks like a domain
    if (/^[a-zA-Z0-9]/.test(trimmed) && (trimmed.includes('.') || trimmed.startsWith('localhost'))) {
      return `https://${trimmed}`;
    }
  }

  return null;
}
