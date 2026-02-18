import * as crypto from 'crypto';

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a single dynamic variable expression (without the surrounding `{{ }}`).
 *
 * Supports comma-separated args:  `$number, 1, 100`  `$string, 8`  `$enum, a, b, c`
 *
 * Returns `undefined` when the expression is not a known dynamic variable.
 */
export function resolveDynamicVariable(expression: string): string | undefined {
  const parts   = expression.split(',').map((s) => s.trim());
  const varName = parts[0];
  const args    = parts.slice(1);

  switch (varName) {
    case '$guid':
    case '$uuid':
      return crypto.randomUUID();

    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));

    case '$isoTimestamp':
      return new Date().toISOString();

    case '$randomInt':
      return String(Math.floor(Math.random() * 1001));

    case '$name':
      return randomName();

    case '$email':
      return randomEmail();

    case '$string': {
      const len = args[0] ? parseInt(args[0], 10) : 16;
      return randomString(isNaN(len) ? 16 : len);
    }

    case '$number': {
      const min = args[0] !== undefined ? Number(args[0]) : 0;
      const max = args[1] !== undefined ? Number(args[1]) : 1000;
      return String(randomNumber(isNaN(min) ? 0 : min, isNaN(max) ? 1000 : max));
    }

    case '$bool':
      return Math.random() < 0.5 ? 'true' : 'false';

    case '$enum':
      return args.length > 0 ? args[Math.floor(Math.random() * args.length)] : undefined;

    case '$date': {
      const fmt = args[0] || 'YYYY-MM-DDTHH:mm:ss';
      return formatDate(new Date(), fmt);
    }

    case '$dateISO':
      return new Date().toISOString();

    default:
      return undefined;
  }
}
