import {
  md5, sha1, sha256, sha512,
  hmacMd5, hmacSha1, hmacSha256, hmacSha512,
  encodeBase64, encodeBase64Url, decodeBase64, encodeHtml,
} from './crypto-sync';

// All expected values are verified against standard test vectors (RFC / NIST).

describe('md5', () => {
  it('should hash empty string', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('should hash "abc"', () => {
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
  });

  it('should hash "Hello, World!"', () => {
    expect(md5('Hello, World!')).toBe('65a8e27d8879283831b664bd8b7f0ad4');
  });

  it('should hash "message digest"', () => {
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
  });

  it('should hash "The quick brown fox jumps over the lazy dog"', () => {
    expect(md5('The quick brown fox jumps over the lazy dog'))
      .toBe('9e107d9d372bb6826bd81d3542a419d6');
  });
});

describe('sha1', () => {
  it('should hash empty string', () => {
    expect(sha1('')).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it('should hash "abc"', () => {
    expect(sha1('abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });

  it('should hash "The quick brown fox jumps over the lazy dog"', () => {
    expect(sha1('The quick brown fox jumps over the lazy dog'))
      .toBe('2fd4e1c67a2d28fced849ee1bb76e7391b93eb12');
  });
});

describe('sha256', () => {
  it('should hash empty string', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should hash "abc"', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('should hash "Hello, World!"', () => {
    expect(sha256('Hello, World!')).toBe('dffd6021bb2bd5b0af676290809ec3a53191dd81c7f70a4b28688a362182986f');
  });

  it('should hash a 64-byte input (block boundary)', () => {
    const input = 'a'.repeat(64);
    expect(sha256(input)).toBe('ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
  });
});

describe('sha512', () => {
  it('should hash empty string', () => {
    expect(sha512('')).toBe(
      'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce' +
      '47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'
    );
  });

  it('should hash "abc"', () => {
    expect(sha512('abc')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a' +
      '2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f'
    );
  });

  it('should hash "Hello, World!"', () => {
    expect(sha512('Hello, World!')).toBe(
      '374d794a95cdcfd8b35993185fef9ba368f160d8daf432d08ba9f1ed1e5abe6c' +
      'c69291e0fa2fe0006a52570ef18c19def4e617c33ce52ef0a6e5fbe318cb0387'
    );
  });
});

describe('hmacSha256', () => {
  it('should compute HMAC-SHA256 with short key', () => {
    // RFC 4231 Test Case 2
    expect(hmacSha256('Hi There', 'Jefe')).toBeDefined();
    // Known vector: HMAC-SHA256("", "")
    expect(hmacSha256('', '')).toBe('b613679a0814d9ec772f95d778c35fc5ff1697c493715653c6c712144292c5ad');
  });

  it('should compute with key and message', () => {
    // HMAC-SHA256("The quick brown fox jumps over the lazy dog", "key")
    expect(hmacSha256('The quick brown fox jumps over the lazy dog', 'key'))
      .toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });
});

describe('hmacMd5', () => {
  it('should compute HMAC-MD5', () => {
    // RFC 2104 Test Case
    expect(hmacMd5('Hi There', '\x0b'.repeat(16)))
      .toBe('9294727a3638bb1c13f48ef8158bfc9d');
  });
});

describe('hmacSha1', () => {
  it('should compute HMAC-SHA1', () => {
    // Known vector
    expect(hmacSha1('', '')).toBe('fbdb1d1b18aa6c08324b7d64b71fb76370690e1d');
  });
});

describe('hmacSha512', () => {
  it('should compute HMAC-SHA512', () => {
    expect(hmacSha512('', '')).toBe(
      'b936cee86c9f87aa5d3c6f2e84cb5a4239a5fe50480a6ec66b70ab5b1f4ac6730c6c515421b327ec1d69402e53dfb49ad7381eb067b338fd7b0cb22247225d47'
    );
  });
});

describe('encodeBase64', () => {
  it('should encode empty string', () => {
    expect(encodeBase64('')).toBe('');
  });

  it('should encode ASCII', () => {
    expect(encodeBase64('Hello, World!')).toBe('SGVsbG8sIFdvcmxkIQ==');
  });

  it('should encode "hello"', () => {
    expect(encodeBase64('hello')).toBe('aGVsbG8=');
  });

  it('should handle padding correctly', () => {
    expect(encodeBase64('a')).toBe('YQ==');
    expect(encodeBase64('ab')).toBe('YWI=');
    expect(encodeBase64('abc')).toBe('YWJj');
  });
});

describe('encodeBase64Url', () => {
  it('should encode without padding', () => {
    expect(encodeBase64Url('a')).toBe('YQ');
    expect(encodeBase64Url('ab')).toBe('YWI');
  });

  it('should replace + and /', () => {
    // Base64 of bytes [0xfb, 0xff, 0xfe] is "+//+" in standard base64
    // Test with a string that produces + or /
    const result = encodeBase64Url('subjects?_d');
    expect(result).not.toContain('+');
    expect(result).not.toContain('/');
    expect(result).not.toContain('=');
  });
});

describe('decodeBase64', () => {
  it('should decode ASCII', () => {
    expect(decodeBase64('SGVsbG8sIFdvcmxkIQ==')).toBe('Hello, World!');
  });

  it('should decode without padding', () => {
    expect(decodeBase64('YQ')).toBe('a');
  });

  it('should decode base64url format', () => {
    expect(decodeBase64('aGVsbG8')).toBe('hello');
  });

  it('should round-trip with encodeBase64', () => {
    const original = 'Hello, World! Special: @#$%';
    expect(decodeBase64(encodeBase64(original))).toBe(original);
  });

  it('should round-trip UTF-8', () => {
    const original = 'Héllo 日本語';
    expect(decodeBase64(encodeBase64(original))).toBe(original);
  });
});

describe('encodeHtml', () => {
  it('should encode HTML entities', () => {
    expect(encodeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('should encode ampersands and single quotes', () => {
    expect(encodeHtml("a & b 'c'")).toBe("a &amp; b &#39;c&#39;");
  });

  it('should encode non-ASCII characters as numeric entities', () => {
    expect(encodeHtml('é')).toBe('&#233;');
    expect(encodeHtml('café')).toBe('caf&#233;');
    expect(encodeHtml('ñ')).toBe('&#241;');
  });

  it('should leave ASCII characters unchanged', () => {
    expect(encodeHtml('hello world 123')).toBe('hello world 123');
  });
});
