/**
 * Pure-JS synchronous implementations of MD5, SHA-1, SHA-256, SHA-512 and HMAC.
 * No dependency on Node `crypto` or Web Crypto (`crypto.subtle`).
 * Works identically in Node, browser, and Tauri webview contexts.
 *
 * All functions accept a UTF-8 string and return a lowercase hex digest.
 */

// ── Byte helpers ────────────────────────────────────────────────────────────

function strToBytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const lo = s.charCodeAt(++i);
      c = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
      out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

function bytesToHex(bytes: number[]): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] >>> 0 & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
}

function wordsToBytes(words: number[], littleEndian: boolean): number[] {
  const out: number[] = [];
  for (const w of words) {
    if (littleEndian) {
      out.push(w & 0xff, (w >>> 8) & 0xff, (w >>> 16) & 0xff, (w >>> 24) & 0xff);
    } else {
      out.push((w >>> 24) & 0xff, (w >>> 16) & 0xff, (w >>> 8) & 0xff, w & 0xff);
    }
  }
  return out;
}

// ── MD5 ─────────────────────────────────────────────────────────────────────

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];

const MD5_K = [
  0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
  0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
  0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
  0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
  0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
  0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
  0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
  0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
];

function md5Bytes(input: number[]): number[] {
  // Pre-processing: pad to 64-byte blocks
  const len = input.length;
  const words: number[] = [];
  for (let i = 0; i < len; i += 4) {
    words[i >> 2] = (input[i] || 0) | ((input[i + 1] || 0) << 8) |
      ((input[i + 2] || 0) << 16) | ((input[i + 3] || 0) << 24);
  }
  words[len >> 2] |= 0x80 << ((len % 4) * 8);
  words[(((len + 8) >>> 6) << 4) + 14] = len * 8;

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  for (let i = 0; i < words.length; i += 16) {
    let a = a0, b = b0, c = c0, d = d0;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) { f = (b & c) | (~b & d); g = j; }
      else if (j < 32) { f = (d & b) | (~d & c); g = (5 * j + 1) % 16; }
      else if (j < 48) { f = b ^ c ^ d; g = (3 * j + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * j) % 16; }
      const temp = d;
      d = c; c = b;
      const sum = (a + f + MD5_K[j] + (words[i + g] | 0)) | 0;
      b = (b + ((sum << MD5_S[j]) | (sum >>> (32 - MD5_S[j])))) | 0;
      a = temp;
    }
    a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
  }

  return wordsToBytes([a0, b0, c0, d0], true);
}

export function md5(input: string): string {
  return bytesToHex(md5Bytes(strToBytes(input)));
}

// ── SHA-1 ───────────────────────────────────────────────────────────────────

function sha1Bytes(input: number[]): number[] {
  const len = input.length;
  // Pre-processing: pad to 64-byte blocks (big-endian)
  const blocks: number[] = [];
  for (let i = 0; i < len; i += 4) {
    blocks[i >> 2] = ((input[i] || 0) << 24) | ((input[i + 1] || 0) << 16) |
      ((input[i + 2] || 0) << 8) | (input[i + 3] || 0);
  }
  blocks[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  const totalBlocks = (((len + 8) >>> 6) << 4) + 16;
  blocks[totalBlocks - 1] = len * 8;

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;

  for (let i = 0; i < totalBlocks; i += 16) {
    const w: number[] = [];
    for (let t = 0; t < 16; t++) w[t] = blocks[i + t] | 0;
    for (let t = 16; t < 80; t++) {
      const x = w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16];
      w[t] = (x << 1) | (x >>> 31);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let t = 0; t < 80; t++) {
      let f: number, k: number;
      if (t < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (t < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (t < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[t]) | 0;
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = temp;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }

  return wordsToBytes([h0, h1, h2, h3, h4], false);
}

export function sha1(input: string): string {
  return bytesToHex(sha1Bytes(strToBytes(input)));
}

// ── SHA-256 ─────────────────────────────────────────────────────────────────

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256Bytes(input: number[]): number[] {
  const len = input.length;
  const blocks: number[] = [];
  for (let i = 0; i < len; i += 4) {
    blocks[i >> 2] = ((input[i] || 0) << 24) | ((input[i + 1] || 0) << 16) |
      ((input[i + 2] || 0) << 8) | (input[i + 3] || 0);
  }
  blocks[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  const totalBlocks = (((len + 8) >>> 6) << 4) + 16;
  blocks[totalBlocks - 1] = len * 8;

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  for (let i = 0; i < totalBlocks; i += 16) {
    const w: number[] = [];
    for (let t = 0; t < 16; t++) w[t] = blocks[i + t] | 0;
    for (let t = 16; t < 64; t++) {
      const s0 = ((w[t - 15] >>> 7) | (w[t - 15] << 25)) ^ ((w[t - 15] >>> 18) | (w[t - 15] << 14)) ^ (w[t - 15] >>> 3);
      const s1 = ((w[t - 2] >>> 17) | (w[t - 2] << 15)) ^ ((w[t - 2] >>> 19) | (w[t - 2] << 13)) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 64; t++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[t] + w[t]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return wordsToBytes([h0, h1, h2, h3, h4, h5, h6, h7], false);
}

export function sha256(input: string): string {
  return bytesToHex(sha256Bytes(strToBytes(input)));
}

// ── SHA-512 (using hi/lo 32-bit pairs for 64-bit words) ─────────────────────

type W64 = [number, number]; // [hi, lo]

function add64(a: W64, b: W64): W64 {
  const lo = (a[1] + b[1]) | 0;
  const hi = (a[0] + b[0] + ((lo >>> 0) < (a[1] >>> 0) ? 1 : 0)) | 0;
  return [hi, lo];
}

function add64_4(a: W64, b: W64, c: W64, d: W64): W64 {
  return add64(add64(a, b), add64(c, d));
}

function add64_5(a: W64, b: W64, c: W64, d: W64, e: W64): W64 {
  return add64(add64_4(a, b, c, d), e);
}

function rotr64(x: W64, n: number): W64 {
  if (n < 32) {
    return [(x[0] >>> n) | (x[1] << (32 - n)), (x[1] >>> n) | (x[0] << (32 - n))];
  }
  const m = n - 32;
  return [(x[1] >>> m) | (x[0] << (32 - m)), (x[0] >>> m) | (x[1] << (32 - m))];
}

function shr64(x: W64, n: number): W64 {
  if (n < 32) {
    return [(x[0] >>> n), (x[1] >>> n) | (x[0] << (32 - n))];
  }
  return [0, (x[0] >>> (n - 32))];
}

function xor64(a: W64, b: W64): W64 { return [a[0] ^ b[0], a[1] ^ b[1]]; }
function and64(a: W64, b: W64): W64 { return [a[0] & b[0], a[1] & b[1]]; }
function not64(a: W64): W64 { return [~a[0], ~a[1]]; }

const SHA512_K: W64[] = [
  [0x428a2f98, 0xd728ae22], [0x71374491, 0x23ef65cd], [0xb5c0fbcf, 0xec4d3b2f], [0xe9b5dba5, 0x8189dbbc],
  [0x3956c25b, 0xf348b538], [0x59f111f1, 0xb605d019], [0x923f82a4, 0xaf194f9b], [0xab1c5ed5, 0xda6d8118],
  [0xd807aa98, 0xa3030242], [0x12835b01, 0x45706fbe], [0x243185be, 0x4ee4b28c], [0x550c7dc3, 0xd5ffb4e2],
  [0x72be5d74, 0xf27b896f], [0x80deb1fe, 0x3b1696b1], [0x9bdc06a7, 0x25c71235], [0xc19bf174, 0xcf692694],
  [0xe49b69c1, 0x9ef14ad2], [0xefbe4786, 0x384f25e3], [0x0fc19dc6, 0x8b8cd5b5], [0x240ca1cc, 0x77ac9c65],
  [0x2de92c6f, 0x592b0275], [0x4a7484aa, 0x6ea6e483], [0x5cb0a9dc, 0xbd41fbd4], [0x76f988da, 0x831153b5],
  [0x983e5152, 0xee66dfab], [0xa831c66d, 0x2db43210], [0xb00327c8, 0x98fb213f], [0xbf597fc7, 0xbeef0ee4],
  [0xc6e00bf3, 0x3da88fc2], [0xd5a79147, 0x930aa725], [0x06ca6351, 0xe003826f], [0x14292967, 0x0a0e6e70],
  [0x27b70a85, 0x46d22ffc], [0x2e1b2138, 0x5c26c926], [0x4d2c6dfc, 0x5ac42aed], [0x53380d13, 0x9d95b3df],
  [0x650a7354, 0x8baf63de], [0x766a0abb, 0x3c77b2a8], [0x81c2c92e, 0x47edaee6], [0x92722c85, 0x1482353b],
  [0xa2bfe8a1, 0x4cf10364], [0xa81a664b, 0xbc423001], [0xc24b8b70, 0xd0f89791], [0xc76c51a3, 0x0654be30],
  [0xd192e819, 0xd6ef5218], [0xd6990624, 0x5565a910], [0xf40e3585, 0x5771202a], [0x106aa070, 0x32bbd1b8],
  [0x19a4c116, 0xb8d2d0c8], [0x1e376c08, 0x5141ab53], [0x2748774c, 0xdf8eeb99], [0x34b0bcb5, 0xe19b48a8],
  [0x391c0cb3, 0xc5c95a63], [0x4ed8aa4a, 0xe3418acb], [0x5b9cca4f, 0x7763e373], [0x682e6ff3, 0xd6b2b8a3],
  [0x748f82ee, 0x5defb2fc], [0x78a5636f, 0x43172f60], [0x84c87814, 0xa1f0ab72], [0x8cc70208, 0x1a6439ec],
  [0x90befffa, 0x23631e28], [0xa4506ceb, 0xde82bde9], [0xbef9a3f7, 0xb2c67915], [0xc67178f2, 0xe372532b],
  [0xca273ece, 0xea26619c], [0xd186b8c7, 0x21c0c207], [0xeada7dd6, 0xcde0eb1e], [0xf57d4f7f, 0xee6ed178],
  [0x06f067aa, 0x72176fba], [0x0a637dc5, 0xa2c898a6], [0x113f9804, 0xbef90dae], [0x1b710b35, 0x131c471b],
  [0x28db77f5, 0x23047d84], [0x32caab7b, 0x40c72493], [0x3c9ebe0a, 0x15c9bebc], [0x431d67c4, 0x9c100d4c],
  [0x4cc5d4be, 0xcb3e42b6], [0x597f299c, 0xfc657e2a], [0x5fcb6fab, 0x3ad6faec], [0x6c44198c, 0x4a475817],
];

function sha512Bytes(input: number[]): number[] {
  const len = input.length;
  // Pre-processing: pad to 128-byte blocks
  const blocks: number[] = [];
  for (let i = 0; i < len; i += 4) {
    blocks[i >> 2] = ((input[i] || 0) << 24) | ((input[i + 1] || 0) << 16) |
      ((input[i + 2] || 0) << 8) | (input[i + 3] || 0);
  }
  // Append bit '1'
  blocks[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
  // Pad to 128-byte boundary with length in last 2 words (we only support < 2^32 bytes)
  const totalWords = (((len + 16) >>> 7) << 5) + 32;
  blocks[totalWords - 1] = len * 8;
  blocks[totalWords - 2] = 0;

  let h0: W64 = [0x6a09e667, 0xf3bcc908], h1: W64 = [0xbb67ae85, 0x84caa73b];
  let h2: W64 = [0x3c6ef372, 0xfe94f82b], h3: W64 = [0xa54ff53a, 0x5f1d36f1];
  let h4: W64 = [0x510e527f, 0xade682d1], h5: W64 = [0x9b05688c, 0x2b3e6c1f];
  let h6: W64 = [0x1f83d9ab, 0xfb41bd6b], h7: W64 = [0x5be0cd19, 0x137e2179];

  for (let i = 0; i < totalWords; i += 32) {
    const w: W64[] = [];
    for (let t = 0; t < 16; t++) {
      w[t] = [blocks[i + t * 2] | 0, blocks[i + t * 2 + 1] | 0];
    }
    for (let t = 16; t < 80; t++) {
      const s0 = xor64(xor64(rotr64(w[t - 15], 1), rotr64(w[t - 15], 8)), shr64(w[t - 15], 7));
      const s1 = xor64(xor64(rotr64(w[t - 2], 19), rotr64(w[t - 2], 61)), shr64(w[t - 2], 6));
      w[t] = add64_4(w[t - 16], s0, w[t - 7], s1);
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let t = 0; t < 80; t++) {
      const S1 = xor64(xor64(rotr64(e, 14), rotr64(e, 18)), rotr64(e, 41));
      const ch = xor64(and64(e, f), and64(not64(e), g));
      const temp1 = add64_5(h, S1, ch, SHA512_K[t], w[t]);
      const S0 = xor64(xor64(rotr64(a, 28), rotr64(a, 34)), rotr64(a, 39));
      const maj = xor64(xor64(and64(a, b), and64(a, c)), and64(b, c));
      const temp2 = add64(S0, maj);
      h = g; g = f; f = e; e = add64(d, temp1);
      d = c; c = b; b = a; a = add64(temp1, temp2);
    }
    h0 = add64(h0, a); h1 = add64(h1, b); h2 = add64(h2, c); h3 = add64(h3, d);
    h4 = add64(h4, e); h5 = add64(h5, f); h6 = add64(h6, g); h7 = add64(h7, h);
  }

  const result: number[] = [];
  for (const w of [h0, h1, h2, h3, h4, h5, h6, h7]) {
    result.push((w[0] >>> 24) & 0xff, (w[0] >>> 16) & 0xff, (w[0] >>> 8) & 0xff, w[0] & 0xff);
    result.push((w[1] >>> 24) & 0xff, (w[1] >>> 16) & 0xff, (w[1] >>> 8) & 0xff, w[1] & 0xff);
  }
  return result;
}

export function sha512(input: string): string {
  return bytesToHex(sha512Bytes(strToBytes(input)));
}

// ── HMAC ────────────────────────────────────────────────────────────────────

type HashBytesFunc = (input: number[]) => number[];

function hmacBytes(hashFn: HashBytesFunc, blockSize: number, key: number[], message: number[]): number[] {
  // If key > blockSize, hash it first
  if (key.length > blockSize) {
    key = hashFn(key);
  }
  // Pad key to blockSize
  while (key.length < blockSize) key.push(0);

  const ipad: number[] = [];
  const opad: number[] = [];
  for (let i = 0; i < blockSize; i++) {
    ipad.push(key[i] ^ 0x36);
    opad.push(key[i] ^ 0x5c);
  }

  const inner = hashFn([...ipad, ...message]);
  return hashFn([...opad, ...inner]);
}

function hmac(hashFn: HashBytesFunc, blockSize: number, input: string, key: string): string {
  return bytesToHex(hmacBytes(hashFn, blockSize, strToBytes(key), strToBytes(input)));
}

export function hmacMd5(input: string, key: string): string { return hmac(md5Bytes, 64, input, key); }
export function hmacSha1(input: string, key: string): string { return hmac(sha1Bytes, 64, input, key); }
export function hmacSha256(input: string, key: string): string { return hmac(sha256Bytes, 64, input, key); }
export function hmacSha512(input: string, key: string): string { return hmac(sha512Bytes, 128, input, key); }

// ── Encoding helpers ────────────────────────────────────────────────────────

export function encodeBase64(input: string): string {
  const bytes = strToBytes(input);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1] ?? 0, b2 = bytes[i + 2] ?? 0;
    const triplet = (b0 << 16) | (b1 << 8) | b2;
    result += chars[(triplet >> 18) & 0x3f];
    result += chars[(triplet >> 12) & 0x3f];
    result += (i + 1 < bytes.length) ? chars[(triplet >> 6) & 0x3f] : '=';
    result += (i + 2 < bytes.length) ? chars[triplet & 0x3f] : '=';
  }
  return result;
}

export function encodeBase64Url(input: string): string {
  return encodeBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBase64(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  // Normalize base64url to base64
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  const bytes: number[] = [];
  for (let i = 0; i < b64.length; i += 4) {
    const a = Math.max(0, chars.indexOf(b64[i]));
    const b = Math.max(0, chars.indexOf(b64[i + 1]));
    const c = Math.max(0, chars.indexOf(b64[i + 2]));
    const d = Math.max(0, chars.indexOf(b64[i + 3]));
    const triplet = (a << 18) | (b << 12) | (c << 6) | d;
    bytes.push((triplet >> 16) & 0xff);
    if (b64[i + 2] !== '=') bytes.push((triplet >> 8) & 0xff);
    if (b64[i + 3] !== '=') bytes.push(triplet & 0xff);
  }
  // Decode UTF-8
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    const b0 = bytes[i];
    if (b0 < 0x80) {
      str += String.fromCharCode(b0);
    } else if (b0 < 0xe0) {
      str += String.fromCharCode(((b0 & 0x1f) << 6) | (bytes[++i] & 0x3f));
    } else if (b0 < 0xf0) {
      str += String.fromCharCode(((b0 & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f));
    } else {
      const cp = ((b0 & 0x07) << 18) | ((bytes[++i] & 0x3f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f);
      str += String.fromCodePoint(cp);
    }
  }
  return str;
}

export function encodeHtml(input: string): string {
  let result = '';
  for (const char of input) {
    const code = char.codePointAt(0)!;
    switch (char) {
      case '&': result += '&amp;'; break;
      case '<': result += '&lt;'; break;
      case '>': result += '&gt;'; break;
      case '"': result += '&quot;'; break;
      case "'": result += '&#39;'; break;
      default:
        result += code > 127 ? `&#${code};` : char;
    }
  }
  return result;
}
