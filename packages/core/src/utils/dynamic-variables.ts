import {
  md5, sha1, sha256, sha512,
  hmacMd5, hmacSha1, hmacSha256, hmacSha512,
  encodeBase64, encodeBase64Url, decodeBase64, encodeHtml,
} from './crypto-sync';
import { faker } from '@faker-js/faker';

// ── Name / Email data ───────────────────────────────────────────────────────

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function randomName(): string {
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const last  = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  return `${first} ${last}`;
}

function randomEmail(): string {
  const first  = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)].toLowerCase();
  const last   = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)].toLowerCase();
  const suffix = Math.floor(Math.random() * 1000);
  const domains = ['example.com', 'test.com', 'example.org'];
  const domain  = domains[Math.floor(Math.random() * domains.length)];
  return `${first}.${last}${suffix}@${domain}`;
}

function randomString(length: number): string {
  const clamped = Math.max(1, Math.min(256, length));
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < clamped; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

function randomNumber(min: number, max: number): number {
  if (min > max) { [min, max] = [max, min]; }
  if (Number.isInteger(min) && Number.isInteger(max)) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function formatDate(date: Date, format: string): string {
  const tokens: Record<string, string> = {
    'YYYY': date.getFullYear().toString(),
    'MM':   String(date.getMonth() + 1).padStart(2, '0'),
    'DD':   String(date.getDate()).padStart(2, '0'),
    'HH':   String(date.getHours()).padStart(2, '0'),
    'mm':   String(date.getMinutes()).padStart(2, '0'),
    'ss':   String(date.getSeconds()).padStart(2, '0'),
  };
  let result = format;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.split(token).join(value);
  }
  return result;
}

function generateUUID(): string {
  // Use crypto.randomUUID when available (Node 19+, all modern browsers, Tauri webview)
  const g = globalThis as any;
  if (typeof g.crypto !== 'undefined' && g.crypto.randomUUID) {
    return g.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function generateUUIDv7(): string {
  const now = Date.now();
  const msHex = now.toString(16).padStart(12, '0');
  const randA = Math.floor(Math.random() * 0x1000);
  const randB = Math.floor(Math.random() * 0x4000) | 0x8000;
  const randC = Math.floor(Math.random() * 0x100000000);
  const randD = Math.floor(Math.random() * 0x10000);
  return (
    msHex.slice(0, 8) + '-' +
    msHex.slice(8, 12) + '-' +
    '7' + randA.toString(16).padStart(3, '0') + '-' +
    randB.toString(16).padStart(4, '0') + '-' +
    randC.toString(16).padStart(8, '0') +
    randD.toString(16).padStart(4, '0')
  );
}

function offsetTimestamp(args: string[]): string {
  const amount = args[0] !== undefined ? Number(args[0]) : 0;
  const unit = (args[1] || 's').toLowerCase();
  if (isNaN(amount)) return String(Math.floor(Date.now() / 1000));
  let ms = 0;
  switch (unit) {
    case 's': ms = amount * 1000; break;
    case 'm': ms = amount * 60 * 1000; break;
    case 'h': ms = amount * 3600 * 1000; break;
    case 'd': ms = amount * 86400 * 1000; break;
    default:  ms = amount * 1000; break;
  }
  return String(Math.floor((Date.now() + ms) / 1000));
}

// ── Namespace registry ──────────────────────────────────────────────────────

/**
 * Known template function namespace prefixes.
 * Used by the variable validator and autocomplete to identify dynamic variables.
 * Does NOT include $cookie or $response (those are context-dependent, handled by the UI layer).
 */
export const KNOWN_TEMPLATE_NAMESPACES: ReadonlySet<string> = new Set([
  '$uuid', '$timestamp', '$random', '$hash', '$hmac', '$encode', '$decode', '$regex', '$json', '$faker', '$prompt', '$file',
]);

// ── Namespaced resolver ─────────────────────────────────────────────────────

function resolveNamespacedFunction(namespace: string, method: string, args: string[]): string | undefined {
  switch (namespace) {
    case '$uuid':
      switch (method) {
        case 'v4': return generateUUID();
        case 'v7': return generateUUIDv7();
        default: return undefined;
      }

    case '$timestamp':
      switch (method) {
        case 'unix':   return String(Math.floor(Date.now() / 1000));
        case 'millis': return String(Date.now());
        case 'iso':    return new Date().toISOString();
        case 'offset': return offsetTimestamp(args);
        case 'format': return formatDate(new Date(), args[0] || 'YYYY-MM-DDTHH:mm:ss');
        default: return undefined;
      }

    case '$random':
      switch (method) {
        case 'int': {
          const min = args[0] !== undefined ? Number(args[0]) : 0;
          const max = args[1] !== undefined ? Number(args[1]) : 1000;
          return String(Math.floor(randomNumber(isNaN(min) ? 0 : min, isNaN(max) ? 1000 : max)));
        }
        case 'number': {
          const min = args[0] !== undefined ? Number(args[0]) : 0;
          const max = args[1] !== undefined ? Number(args[1]) : 1000;
          return String(randomNumber(isNaN(min) ? 0 : min, isNaN(max) ? 1000 : max));
        }
        case 'string': {
          const len = args[0] ? parseInt(args[0], 10) : 16;
          return randomString(isNaN(len) ? 16 : len);
        }
        case 'bool':  return Math.random() < 0.5 ? 'true' : 'false';
        case 'enum':  return args.length > 0 ? args[Math.floor(Math.random() * args.length)] : undefined;
        case 'name':  return randomName();
        case 'email': return randomEmail();
        default: return undefined;
      }

    case '$hash':
      if (!args[0]) return undefined;
      switch (method) {
        case 'md5':    return md5(args[0]);
        case 'sha1':   return sha1(args[0]);
        case 'sha256': return sha256(args[0]);
        case 'sha512': return sha512(args[0]);
        default: return undefined;
      }

    case '$hmac':
      if (!args[0] || !args[1]) return undefined;
      switch (method) {
        case 'md5':    return hmacMd5(args[0], args[1]);
        case 'sha1':   return hmacSha1(args[0], args[1]);
        case 'sha256': return hmacSha256(args[0], args[1]);
        case 'sha512': return hmacSha512(args[0], args[1]);
        default: return undefined;
      }

    case '$encode':
      switch (method) {
        case 'base64':    return encodeBase64(args[0] ?? '');
        case 'base64url': return encodeBase64Url(args[0] ?? '');
        case 'url':       return encodeURIComponent(args[0] ?? '');
        case 'html':      return encodeHtml(args[0] ?? '');
        default: return undefined;
      }

    case '$decode':
      if (!args[0]) return undefined;
      switch (method) {
        case 'base64': return decodeBase64(args[0]);
        case 'url':    return decodeURIComponent(args[0]);
        default: return undefined;
      }

    case '$regex': {
      if (!args[0] || !args[1]) return undefined;
      try {
        switch (method) {
          case 'match': {
            const re = new RegExp(args[1], args[2] || '');
            const m = args[0].match(re);
            return m ? m[0] : '';
          }
          case 'replace': {
            const re = new RegExp(args[1], args[3] || '');
            return args[0].replace(re, args[2] || '');
          }
          default: return undefined;
        }
      } catch {
        return undefined;
      }
    }

    case '$json':
      switch (method) {
        case 'escape':  return args[0] !== undefined ? JSON.stringify(args[0]).slice(1, -1) : undefined;
        case 'minify': {
          if (!args[0]) return undefined;
          try { return JSON.stringify(JSON.parse(args[0])); }
          catch { return undefined; }
        }
        default: return undefined;
      }

    case '$faker':
      switch (method) {
        // Person
        case 'firstName':     return faker.person.firstName();
        case 'lastName':      return faker.person.lastName();
        case 'fullName':      return faker.person.fullName();
        case 'jobTitle':      return faker.person.jobTitle();
        case 'gender':        return faker.person.gender();
        case 'prefix':        return faker.person.prefix();
        case 'suffix':        return faker.person.suffix();
        // Internet
        case 'email':         return faker.internet.email();
        case 'username':      return faker.internet.username();
        case 'url':           return faker.internet.url();
        case 'ip':            return faker.internet.ip();
        case 'ipv6':          return faker.internet.ipv6();
        case 'mac':           return faker.internet.mac();
        case 'password': {
          const len = args[0] ? parseInt(args[0], 10) : 16;
          return faker.internet.password({ length: isNaN(len) ? 16 : len });
        }
        case 'userAgent':     return faker.internet.userAgent();
        case 'domainName':    return faker.internet.domainName();
        // Location
        case 'city':          return faker.location.city();
        case 'country':       return faker.location.country();
        case 'countryCode':   return faker.location.countryCode();
        case 'state':         return faker.location.state();
        case 'street':        return faker.location.street();
        case 'streetAddress':  return faker.location.streetAddress();
        case 'zipCode':       return faker.location.zipCode();
        case 'latitude':      return String(faker.location.latitude());
        case 'longitude':     return String(faker.location.longitude());
        case 'timeZone':      return faker.location.timeZone();
        // Phone
        case 'phone':         return faker.phone.number();
        // Company
        case 'company':       return faker.company.name();
        case 'buzzPhrase':    return faker.company.buzzPhrase();
        case 'catchPhrase':   return faker.company.catchPhrase();
        // Finance
        case 'currencyCode':  return faker.finance.currencyCode();
        case 'currencyName':  return faker.finance.currencyName();
        case 'iban':          return faker.finance.iban();
        case 'creditCard':    return faker.finance.creditCardNumber();
        case 'amount': {
          const min = args[0] ? Number(args[0]) : 0;
          const max = args[1] ? Number(args[1]) : 1000;
          const dec = args[2] ? parseInt(args[2], 10) : 2;
          return faker.finance.amount({ min, max, dec: isNaN(dec) ? 2 : dec });
        }
        case 'bitcoinAddress': return faker.finance.bitcoinAddress();
        // Lorem
        case 'word':          return faker.lorem.word();
        case 'words': {
          const count = args[0] ? parseInt(args[0], 10) : 3;
          return faker.lorem.words(isNaN(count) ? 3 : count);
        }
        case 'sentence':      return faker.lorem.sentence();
        case 'paragraph':     return faker.lorem.paragraph();
        case 'slug':          return faker.lorem.slug();
        // String / Identifiers
        case 'uuid':          return faker.string.uuid();
        case 'nanoid':        return faker.string.nanoid();
        case 'alpha': {
          const count = args[0] ? parseInt(args[0], 10) : 8;
          return faker.string.alpha({ length: isNaN(count) ? 8 : count });
        }
        case 'alphanumeric': {
          const count = args[0] ? parseInt(args[0], 10) : 8;
          return faker.string.alphanumeric({ length: isNaN(count) ? 8 : count });
        }
        case 'numeric': {
          const count = args[0] ? parseInt(args[0], 10) : 8;
          return faker.string.numeric({ length: isNaN(count) ? 8 : count });
        }
        case 'hexadecimal': {
          const count = args[0] ? parseInt(args[0], 10) : 8;
          return faker.string.hexadecimal({ length: isNaN(count) ? 8 : count });
        }
        case 'boolean':       return String(faker.datatype.boolean());
        // Date & Time
        case 'past':          return faker.date.past().toISOString();
        case 'future':        return faker.date.future().toISOString();
        case 'recent':        return faker.date.recent().toISOString();
        case 'birthdate':     return faker.date.birthdate().toISOString().slice(0, 10);
        case 'weekday':       return faker.date.weekday();
        case 'month':         return faker.date.month();
        // Color
        case 'colorName':     return faker.color.human();
        case 'colorHex':      return faker.color.rgb({ format: 'hex' });
        case 'colorRgb':      return faker.color.rgb({ format: 'css' });
        // Image
        case 'imageUrl':      return faker.image.url();
        case 'avatar':        return faker.image.avatar();
        // Hacker
        case 'hackerPhrase':  return faker.hacker.phrase();
        case 'hackerAbbr':    return faker.hacker.abbreviation();
        // Database
        case 'dbColumn':      return faker.database.column();
        case 'dbType':        return faker.database.type();
        case 'dbEngine':      return faker.database.engine();
        // System
        case 'fileName':      return faker.system.fileName();
        case 'fileExt':       return faker.system.fileExt();
        case 'mimeType':      return faker.system.mimeType();
        case 'semver':        return faker.system.semver();
        default:              return undefined;
      }

    default:
      return undefined;
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a single dynamic variable expression (without the surrounding `{{ }}`).
 *
 * Uses namespaced syntax: `$uuid.v4`  `$hash.sha256, inputText`  `$hmac.sha256, input, key`
 *
 * Returns `undefined` when the expression is not a known dynamic variable,
 * or for context-dependent variables ($cookie, $response) that need UI store access.
 */
export function resolveDynamicVariable(expression: string): string | undefined {
  // Skip context-dependent variables (handled by the UI layer with store access)
  if (expression.startsWith('$cookie.') || expression.startsWith('$response.') || expression.startsWith('$prompt.') || expression.startsWith('$file.')) {
    return undefined;
  }

  // Namespaced syntax: find first '.' before first ','
  const firstComma = expression.indexOf(',');
  const firstDot = expression.indexOf('.');
  if (firstDot !== -1 && (firstComma === -1 || firstDot < firstComma)) {
    const prefix = expression.substring(0, firstDot);
    if (KNOWN_TEMPLATE_NAMESPACES.has(prefix)) {
      const rest = expression.substring(firstDot + 1);
      const parts = rest.split(',').map(s => s.trim());
      const method = parts[0];
      const args = parts.slice(1);
      return resolveNamespacedFunction(prefix, method, args);
    }
  }

  return undefined;
}
