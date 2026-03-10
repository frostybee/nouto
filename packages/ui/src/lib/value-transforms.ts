export interface ValueTransform {
  id: string;
  label: string;
  category: 'encode' | 'decode' | 'hash' | 'text';
  transform: (input: string) => string | Promise<string>;
}

export interface MockVariable {
  name: string;
  description: string;
  example: string;
  namespace?: string;
  args?: string;
}

// Namespaced template functions
const NAMESPACED_VARIABLES: MockVariable[] = [
  // UUID
  { name: '$uuid.v4', namespace: 'uuid', description: 'Random UUID v4', example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' },
  { name: '$uuid.v7', namespace: 'uuid', description: 'Time-ordered UUID v7 (RFC 9562)', example: '019544a4-d29b-7123-8456-abcdef012345' },

  // Timestamp
  { name: '$timestamp.unix', namespace: 'timestamp', description: 'Unix timestamp (seconds)', example: '1709740800' },
  { name: '$timestamp.millis', namespace: 'timestamp', description: 'Unix timestamp (milliseconds)', example: '1709740800000' },
  { name: '$timestamp.iso', namespace: 'timestamp', description: 'ISO 8601 timestamp', example: '2024-03-06T12:00:00.000Z' },
  { name: '$timestamp.offset', namespace: 'timestamp', args: 'amount, unit', description: 'Offset timestamp by N units (s/m/h/d)', example: '{{$timestamp.offset, 7, d}}' },
  { name: '$timestamp.format', namespace: 'timestamp', args: 'format', description: 'Formatted date (YYYY, MM, DD, HH, mm, ss)', example: '{{$timestamp.format, YYYY-MM-DD}}' },

  // Random
  { name: '$random.int', namespace: 'random', args: 'min, max', description: 'Random integer in range', example: '742' },
  { name: '$random.number', namespace: 'random', args: 'min, max', description: 'Random number in range', example: '847.23' },
  { name: '$random.string', namespace: 'random', args: 'length', description: 'Random alphanumeric string', example: 'aB3kF9mP2xR7wL4q' },
  { name: '$random.bool', namespace: 'random', description: 'Random boolean', example: 'true' },
  { name: '$random.enum', namespace: 'random', args: 'a, b, c, ...', description: 'Random value from list', example: '{{$random.enum, red, green, blue}}' },
  { name: '$random.name', namespace: 'random', description: 'Random full name', example: 'John Smith' },
  { name: '$random.email', namespace: 'random', description: 'Random email address', example: 'jane.doe123@example.com' },

  // Hash
  { name: '$hash.md5', namespace: 'hash', args: 'input', description: 'MD5 hash of input', example: '{{$hash.md5, hello}}' },
  { name: '$hash.sha1', namespace: 'hash', args: 'input', description: 'SHA-1 hash of input', example: '{{$hash.sha1, hello}}' },
  { name: '$hash.sha256', namespace: 'hash', args: 'input', description: 'SHA-256 hash of input', example: '{{$hash.sha256, hello}}' },
  { name: '$hash.sha512', namespace: 'hash', args: 'input', description: 'SHA-512 hash of input', example: '{{$hash.sha512, hello}}' },

  // HMAC
  { name: '$hmac.md5', namespace: 'hmac', args: 'input, key', description: 'HMAC-MD5 of input with key', example: '{{$hmac.md5, data, secret}}' },
  { name: '$hmac.sha1', namespace: 'hmac', args: 'input, key', description: 'HMAC-SHA1 of input with key', example: '{{$hmac.sha1, data, secret}}' },
  { name: '$hmac.sha256', namespace: 'hmac', args: 'input, key', description: 'HMAC-SHA256 of input with key', example: '{{$hmac.sha256, data, secret}}' },
  { name: '$hmac.sha512', namespace: 'hmac', args: 'input, key', description: 'HMAC-SHA512 of input with key', example: '{{$hmac.sha512, data, secret}}' },

  // Encode
  { name: '$encode.base64', namespace: 'encode', args: 'input', description: 'Base64 encode', example: '{{$encode.base64, hello}}' },
  { name: '$encode.base64url', namespace: 'encode', args: 'input', description: 'Base64URL encode (no padding)', example: '{{$encode.base64url, hello}}' },
  { name: '$encode.url', namespace: 'encode', args: 'input', description: 'URL/percent encode', example: '{{$encode.url, hello world}}' },
  { name: '$encode.html', namespace: 'encode', args: 'input', description: 'HTML entity encode', example: '{{$encode.html, <b>hi</b>}}' },

  // Decode
  { name: '$decode.base64', namespace: 'decode', args: 'input', description: 'Base64 decode', example: '{{$decode.base64, aGVsbG8=}}' },
  { name: '$decode.url', namespace: 'decode', args: 'input', description: 'URL/percent decode', example: '{{$decode.url, hello%20world}}' },

  // Regex
  { name: '$regex.match', namespace: 'regex', args: 'input, pattern, flags', description: 'Extract first regex match', example: '{{$regex.match, hello123, \\d+}}' },
  { name: '$regex.replace', namespace: 'regex', args: 'input, pattern, replacement, flags', description: 'Replace with regex', example: '{{$regex.replace, hello, l, r, g}}' },

  // JSON
  { name: '$json.escape', namespace: 'json', args: 'input', description: 'JSON-escape a string', example: '{{$json.escape, he said "hi"}}' },
  { name: '$json.minify', namespace: 'json', args: 'input', description: 'Minify JSON (remove whitespace)', example: '{{$json.minify, { "a": 1 }}}' },

  // Context-dependent (resolved by UI layer)
  { name: '$cookie', description: 'Cookie value from active cookie jar', example: '{{$cookie.session_id}}' },
];

export const MOCK_VARIABLES: MockVariable[] = NAMESPACED_VARIABLES;

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function htmlEncode(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function hashHex(algorithm: string, input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest(algorithm, data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Inline MD5 (Web Crypto doesn't support it)
function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    words[i >> 2] = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24);
  }
  const len = bytes.length;
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[(((len + 8) >>> 6) << 4) + 14] = len * 8;

  let a = 0x67452301, b = 0xefcdab89, c = 0x98badcfe, d = 0x10325476;

  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ];
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];

  function rotl(x: number, n: number) { return (x << n) | (x >>> (32 - n)); }
  function add(x: number, y: number) { return (x + y) | 0; }

  for (let i = 0; i < words.length; i += 16) {
    let aa = a, bb = b, cc = c, dd = d;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) { f = (b & c) | (~b & d); g = j; }
      else if (j < 32) { f = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
      else if (j < 48) { f = b ^ c ^ d; g = (3 * j + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * j) % 16; }
      const temp = d;
      d = c; c = b;
      b = add(b, rotl(add(add(a, f), add(K[j], words[i + g] | 0)), S[j]));
      a = temp;
    }
    a = add(a, aa); b = add(b, bb); c = add(c, cc); d = add(d, dd);
  }

  function toHex(n: number) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ((n >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
    return s;
  }
  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

export const VALUE_TRANSFORMS: ValueTransform[] = [
  { id: 'base64-encode', label: 'Base64 Encode', category: 'encode', transform: utf8ToBase64 },
  { id: 'base64-decode', label: 'Base64 Decode', category: 'decode', transform: base64ToUtf8 },
  { id: 'url-encode', label: 'URL Encode', category: 'encode', transform: (s) => encodeURIComponent(s) },
  { id: 'url-decode', label: 'URL Decode', category: 'decode', transform: (s) => decodeURIComponent(s) },
  { id: 'html-encode', label: 'HTML Encode', category: 'encode', transform: htmlEncode },
  { id: 'lowercase', label: 'Lowercase', category: 'text', transform: (s) => s.toLowerCase() },
  { id: 'uppercase', label: 'Uppercase', category: 'text', transform: (s) => s.toUpperCase() },
  { id: 'sha256', label: 'SHA-256 Hash', category: 'hash', transform: (s) => hashHex('SHA-256', s) },
  { id: 'sha512', label: 'SHA-512 Hash', category: 'hash', transform: (s) => hashHex('SHA-512', s) },
  { id: 'md5', label: 'MD5 Hash', category: 'hash', transform: md5 },
];

export function insertAtCursor(input: HTMLInputElement, text: string): string {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  return input.value.slice(0, start) + text + input.value.slice(end);
}
