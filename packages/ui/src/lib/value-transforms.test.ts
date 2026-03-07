import { describe, it, expect } from 'vitest';
import { VALUE_TRANSFORMS, MOCK_VARIABLES, insertAtCursor } from './value-transforms';

function getTransform(id: string) {
  const t = VALUE_TRANSFORMS.find(t => t.id === id);
  if (!t) throw new Error(`Transform ${id} not found`);
  return t.transform;
}

describe('VALUE_TRANSFORMS', () => {
  it('should have 10 transforms', () => {
    expect(VALUE_TRANSFORMS).toHaveLength(10);
  });

  describe('Base64 Encode', () => {
    const transform = getTransform('base64-encode');

    it('should encode ASCII strings', () => {
      expect(transform('Hello, World!')).toBe('SGVsbG8sIFdvcmxkIQ==');
    });

    it('should encode empty string', () => {
      expect(transform('')).toBe('');
    });

    it('should encode UTF-8 strings', () => {
      const encoded = transform('Héllo 日本語');
      expect(typeof encoded).toBe('string');
      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe('Base64 Decode', () => {
    const transform = getTransform('base64-decode');

    it('should decode ASCII strings', () => {
      expect(transform('SGVsbG8sIFdvcmxkIQ==')).toBe('Hello, World!');
    });

    it('should decode empty string', () => {
      expect(transform('')).toBe('');
    });
  });

  describe('Base64 round-trip', () => {
    const encode = getTransform('base64-encode');
    const decode = getTransform('base64-decode');

    it('should round-trip ASCII', () => {
      const original = 'Hello, World!';
      expect(decode(encode(original) as string)).toBe(original);
    });

    it('should round-trip UTF-8', () => {
      const original = 'Héllo 日本語 emoji: 🎉';
      expect(decode(encode(original) as string)).toBe(original);
    });
  });

  describe('URL Encode', () => {
    const transform = getTransform('url-encode');

    it('should encode special characters', () => {
      expect(transform('hello world')).toBe('hello%20world');
      expect(transform('a=b&c=d')).toBe('a%3Db%26c%3Dd');
    });

    it('should not encode unreserved characters', () => {
      expect(transform('hello-world_123.test~')).toBe('hello-world_123.test~');
    });
  });

  describe('URL Decode', () => {
    const transform = getTransform('url-decode');

    it('should decode encoded characters', () => {
      expect(transform('hello%20world')).toBe('hello world');
      expect(transform('a%3Db%26c%3Dd')).toBe('a=b&c=d');
    });
  });

  describe('URL round-trip', () => {
    const encode = getTransform('url-encode');
    const decode = getTransform('url-decode');

    it('should round-trip special chars', () => {
      const original = 'key=value&foo=bar baz';
      expect(decode(encode(original) as string)).toBe(original);
    });
  });

  describe('HTML Encode', () => {
    const transform = getTransform('html-encode');

    it('should encode HTML entities', () => {
      expect(transform('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should encode ampersands', () => {
      expect(transform('a & b')).toBe('a &amp; b');
    });

    it('should encode single quotes', () => {
      expect(transform("it's")).toBe('it&#39;s');
    });
  });

  describe('Lowercase', () => {
    const transform = getTransform('lowercase');

    it('should convert to lowercase', () => {
      expect(transform('Hello WORLD')).toBe('hello world');
    });
  });

  describe('Uppercase', () => {
    const transform = getTransform('uppercase');

    it('should convert to uppercase', () => {
      expect(transform('Hello World')).toBe('HELLO WORLD');
    });
  });

  describe('SHA-256 Hash', () => {
    const transform = getTransform('sha256');

    it('should hash empty string to known value', async () => {
      const result = await transform('');
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('should hash "abc" to known value', async () => {
      const result = await transform('abc');
      expect(result).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
  });

  describe('SHA-512 Hash', () => {
    const transform = getTransform('sha512');

    it('should hash empty string to known value', async () => {
      const result = await transform('');
      expect(result).toBe(
        'cf83e1357eefb8bdf1542850d66d8007d620e4050b5715dc83f4a921d36ce9ce' +
        '47d0d13c5d85f2b0ff8318d2877eec2f63b931bd47417a81a538327af927da3e'
      );
    });
  });

  describe('MD5 Hash', () => {
    const transform = getTransform('md5');

    it('should hash empty string to known value', () => {
      expect(transform('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    });

    it('should hash "abc" to known value', () => {
      expect(transform('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    });

    it('should hash "Hello, World!" to known value', () => {
      expect(transform('Hello, World!')).toBe('65a8e27d8879283831b664bd8b7f0ad4');
    });
  });
});

describe('MOCK_VARIABLES', () => {
  it('should have 13 entries', () => {
    expect(MOCK_VARIABLES).toHaveLength(13);
  });

  it('all names should start with $', () => {
    for (const v of MOCK_VARIABLES) {
      expect(v.name.startsWith('$')).toBe(true);
    }
  });

  it('all should have description and example', () => {
    for (const v of MOCK_VARIABLES) {
      expect(v.description.length).toBeGreaterThan(0);
      expect(v.example.length).toBeGreaterThan(0);
    }
  });
});

describe('insertAtCursor', () => {
  function mockInput(value: string, selStart: number | null, selEnd?: number | null): HTMLInputElement {
    return { value, selectionStart: selStart, selectionEnd: selEnd ?? selStart } as HTMLInputElement;
  }

  it('should insert at cursor position', () => {
    const input = mockInput('hello world', 5, 5);
    expect(insertAtCursor(input, ' beautiful')).toBe('hello beautiful world');
  });

  it('should replace selection', () => {
    const input = mockInput('hello world', 0, 5);
    expect(insertAtCursor(input, 'goodbye')).toBe('goodbye world');
  });

  it('should append when cursor is null', () => {
    const input = mockInput('hello', null, null);
    expect(insertAtCursor(input, ' world')).toBe('hello world');
  });

  it('should insert at beginning', () => {
    const input = mockInput('world', 0, 0);
    expect(insertAtCursor(input, 'hello ')).toBe('hello world');
  });

  it('should handle empty input', () => {
    const input = mockInput('', 0, 0);
    expect(insertAtCursor(input, 'text')).toBe('text');
  });
});
