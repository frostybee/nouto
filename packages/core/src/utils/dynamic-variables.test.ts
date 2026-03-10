import { resolveDynamicVariable, KNOWN_TEMPLATE_NAMESPACES } from './dynamic-variables';

describe('KNOWN_TEMPLATE_NAMESPACES', () => {
  it('should contain all expected namespaces', () => {
    const expected = ['$uuid', '$timestamp', '$random', '$hash', '$hmac', '$encode', '$decode', '$regex', '$json'];
    for (const ns of expected) {
      expect(KNOWN_TEMPLATE_NAMESPACES.has(ns)).toBe(true);
    }
  });

  it('should NOT contain $cookie or $response', () => {
    expect(KNOWN_TEMPLATE_NAMESPACES.has('$cookie')).toBe(false);
    expect(KNOWN_TEMPLATE_NAMESPACES.has('$response')).toBe(false);
  });
});

describe('resolveDynamicVariable - removed legacy flat syntax', () => {
  it('should return undefined for removed legacy names', () => {
    expect(resolveDynamicVariable('$guid')).toBeUndefined();
    expect(resolveDynamicVariable('$uuid')).toBeUndefined();
    expect(resolveDynamicVariable('$uuidv7')).toBeUndefined();
    expect(resolveDynamicVariable('$timestamp')).toBeUndefined();
    expect(resolveDynamicVariable('$isoTimestamp')).toBeUndefined();
    expect(resolveDynamicVariable('$randomInt')).toBeUndefined();
    expect(resolveDynamicVariable('$name')).toBeUndefined();
    expect(resolveDynamicVariable('$email')).toBeUndefined();
    expect(resolveDynamicVariable('$string')).toBeUndefined();
    expect(resolveDynamicVariable('$number')).toBeUndefined();
    expect(resolveDynamicVariable('$bool')).toBeUndefined();
    expect(resolveDynamicVariable('$enum, a, b')).toBeUndefined();
    expect(resolveDynamicVariable('$date')).toBeUndefined();
    expect(resolveDynamicVariable('$dateISO')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - context-dependent variables', () => {
  it('should return undefined for $cookie (UI-only)', () => {
    expect(resolveDynamicVariable('$cookie.session_id')).toBeUndefined();
  });

  it('should return undefined for $response (UI-only)', () => {
    expect(resolveDynamicVariable('$response.body.token')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - namespaced: $uuid', () => {
  it('should resolve $uuid.v4', () => {
    const result = resolveDynamicVariable('$uuid.v4');
    expect(result).toMatch(/^[0-9a-f]{8}-/);
  });

  it('should resolve $uuid.v7', () => {
    const result = resolveDynamicVariable('$uuid.v7');
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('should return undefined for unknown method', () => {
    expect(resolveDynamicVariable('$uuid.v3')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - namespaced: $timestamp', () => {
  it('should resolve $timestamp.unix', () => {
    const result = resolveDynamicVariable('$timestamp.unix');
    expect(Number(result)).toBeGreaterThan(1700000000);
  });

  it('should resolve $timestamp.millis', () => {
    const result = resolveDynamicVariable('$timestamp.millis');
    expect(Number(result)).toBeGreaterThan(1700000000000);
  });

  it('should resolve $timestamp.iso', () => {
    const result = resolveDynamicVariable('$timestamp.iso');
    expect(result).toMatch(/Z$/);
  });

  it('should resolve $timestamp.offset with seconds', () => {
    const result = resolveDynamicVariable('$timestamp.offset, 60, s');
    const now = Math.floor(Date.now() / 1000);
    expect(Number(result)).toBeGreaterThanOrEqual(now + 58);
    expect(Number(result)).toBeLessThanOrEqual(now + 62);
  });

  it('should resolve $timestamp.offset with days', () => {
    const result = resolveDynamicVariable('$timestamp.offset, 1, d');
    const now = Math.floor(Date.now() / 1000);
    const expected = now + 86400;
    expect(Math.abs(Number(result) - expected)).toBeLessThan(5);
  });

  it('should resolve $timestamp.format', () => {
    const result = resolveDynamicVariable('$timestamp.format, YYYY-MM-DD');
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('resolveDynamicVariable - namespaced: $random', () => {
  it('should resolve $random.int', () => {
    const result = resolveDynamicVariable('$random.int, 1, 10');
    const num = Number(result);
    expect(num).toBeGreaterThanOrEqual(1);
    expect(num).toBeLessThanOrEqual(10);
    expect(Number.isInteger(num)).toBe(true);
  });

  it('should resolve $random.number', () => {
    const result = resolveDynamicVariable('$random.number, 0, 100');
    const num = Number(result);
    expect(num).toBeGreaterThanOrEqual(0);
    expect(num).toBeLessThanOrEqual(100);
  });

  it('should resolve $random.string with length', () => {
    expect(resolveDynamicVariable('$random.string, 5')).toHaveLength(5);
  });

  it('should resolve $random.bool', () => {
    expect(['true', 'false']).toContain(resolveDynamicVariable('$random.bool'));
  });

  it('should resolve $random.enum', () => {
    expect(['a', 'b']).toContain(resolveDynamicVariable('$random.enum, a, b'));
  });

  it('should resolve $random.name', () => {
    expect(resolveDynamicVariable('$random.name')).toMatch(/^\w+ \w+$/);
  });

  it('should resolve $random.email', () => {
    expect(resolveDynamicVariable('$random.email')).toMatch(/@/);
  });
});

describe('resolveDynamicVariable - namespaced: $hash', () => {
  it('should resolve $hash.md5', () => {
    expect(resolveDynamicVariable('$hash.md5, hello'))
      .toBe('5d41402abc4b2a76b9719d911017c592');
  });

  it('should resolve $hash.sha1', () => {
    expect(resolveDynamicVariable('$hash.sha1, hello'))
      .toBe('aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d');
  });

  it('should resolve $hash.sha256', () => {
    expect(resolveDynamicVariable('$hash.sha256, hello'))
      .toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('should resolve $hash.sha512', () => {
    const result = resolveDynamicVariable('$hash.sha512, hello');
    expect(result).toHaveLength(128);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('should return undefined without input', () => {
    expect(resolveDynamicVariable('$hash.sha256')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - namespaced: $hmac', () => {
  it('should resolve $hmac.sha256', () => {
    const result = resolveDynamicVariable('$hmac.sha256, The quick brown fox jumps over the lazy dog, key');
    expect(result).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  it('should return undefined without key', () => {
    expect(resolveDynamicVariable('$hmac.sha256, hello')).toBeUndefined();
  });

  it('should return undefined without input', () => {
    expect(resolveDynamicVariable('$hmac.sha256')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - namespaced: $encode', () => {
  it('should resolve $encode.base64', () => {
    expect(resolveDynamicVariable('$encode.base64, hello')).toBe('aGVsbG8=');
  });

  it('should resolve $encode.base64url', () => {
    const result = resolveDynamicVariable('$encode.base64url, hello');
    expect(result).not.toContain('=');
    expect(result).toBe('aGVsbG8');
  });

  it('should resolve $encode.url', () => {
    expect(resolveDynamicVariable('$encode.url, hello world')).toBe('hello%20world');
  });

  it('should resolve $encode.html', () => {
    expect(resolveDynamicVariable('$encode.html, <b>hi</b>')).toBe('&lt;b&gt;hi&lt;/b&gt;');
  });

  it('should handle empty input', () => {
    expect(resolveDynamicVariable('$encode.base64')).toBe('');
    expect(resolveDynamicVariable('$encode.url')).toBe('');
  });
});

describe('resolveDynamicVariable - namespaced: $decode', () => {
  it('should resolve $decode.base64', () => {
    expect(resolveDynamicVariable('$decode.base64, aGVsbG8=')).toBe('hello');
  });

  it('should resolve $decode.url', () => {
    expect(resolveDynamicVariable('$decode.url, hello%20world')).toBe('hello world');
  });

  it('should return undefined without input', () => {
    expect(resolveDynamicVariable('$decode.base64')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - namespaced: $regex', () => {
  it('should resolve $regex.match', () => {
    expect(resolveDynamicVariable('$regex.match, hello123world, \\d+')).toBe('123');
  });

  it('should return empty string when no match', () => {
    expect(resolveDynamicVariable('$regex.match, hello, \\d+')).toBe('');
  });

  it('should resolve $regex.replace', () => {
    expect(resolveDynamicVariable('$regex.replace, hello, l, r, g')).toBe('herro');
  });

  it('should return undefined for invalid regex', () => {
    expect(resolveDynamicVariable('$regex.match, hello, [')).toBeUndefined();
  });

  it('should return undefined without input', () => {
    expect(resolveDynamicVariable('$regex.match')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - namespaced: $json', () => {
  it('should resolve $json.escape', () => {
    expect(resolveDynamicVariable('$json.escape, he said "hi"')).toBe('he said \\"hi\\"');
  });

  it('should resolve $json.minify', () => {
    expect(resolveDynamicVariable('$json.minify, { "a": 1 }')).toBe('{"a":1}');
  });

  it('should return undefined for invalid JSON in $json.minify', () => {
    expect(resolveDynamicVariable('$json.minify, not json')).toBeUndefined();
  });
});

describe('resolveDynamicVariable - unknown expressions', () => {
  it('should return undefined for unknown flat variable', () => {
    expect(resolveDynamicVariable('$unknown')).toBeUndefined();
  });

  it('should return undefined for unknown namespace', () => {
    expect(resolveDynamicVariable('$foo.bar')).toBeUndefined();
  });

  it('should return undefined for unknown method in known namespace', () => {
    expect(resolveDynamicVariable('$hash.blake2')).toBeUndefined();
  });
});
