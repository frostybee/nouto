import { CurlParserService } from './CurlParserService';
import * as fs from 'fs';

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

describe('CurlParserService', () => {
  let service: CurlParserService;

  beforeEach(() => {
    service = new CurlParserService();
    jest.clearAllMocks();
  });

  // 1. Basic GET command
  describe('basic GET command', () => {
    it('should parse a simple GET request', () => {
      const result = service.importFromString('curl https://api.example.com/users');
      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://api.example.com/users');
    });
  });

  // 2. POST with JSON body (-d)
  describe('POST with JSON body', () => {
    it('should parse POST with -d JSON body', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/users -H "Content-Type: application/json" -d \'{"name":"John","age":30}\''
      );
      expect(result.method).toBe('POST');
      expect(result.url).toBe('https://api.example.com/users');
      expect(result.body?.content).toBe('{"name":"John","age":30}');
      expect(result.body?.type).toBe('json');
    });
  });

  // 3. Custom method (-X PUT)
  describe('custom method', () => {
    it('should parse -X PUT', () => {
      const result = service.importFromString(
        'curl -X PUT https://api.example.com/users/1 -d \'{"name":"Jane"}\''
      );
      expect(result.method).toBe('PUT');
      expect(result.url).toBe('https://api.example.com/users/1');
    });

    it('should parse --request DELETE', () => {
      const result = service.importFromString(
        'curl --request DELETE https://api.example.com/users/1'
      );
      expect(result.method).toBe('DELETE');
    });

    it('should parse -X PATCH', () => {
      const result = service.importFromString(
        'curl -X PATCH https://api.example.com/users/1 -d \'{"status":"active"}\''
      );
      expect(result.method).toBe('PATCH');
    });
  });

  // 4. Multiple headers
  describe('multiple headers', () => {
    it('should parse multiple -H headers', () => {
      const result = service.importFromString(
        'curl https://api.example.com/data -H "Accept: application/json" -H "X-Custom-Header: my-value" -H "Cache-Control: no-cache"'
      );
      const headers = result.headers || [];
      expect(headers.length).toBeGreaterThanOrEqual(3);

      const acceptHeader = headers.find((h) => h.key === 'Accept');
      expect(acceptHeader?.value).toBe('application/json');

      const customHeader = headers.find((h) => h.key === 'X-Custom-Header');
      expect(customHeader?.value).toBe('my-value');

      const cacheHeader = headers.find((h) => h.key === 'Cache-Control');
      expect(cacheHeader?.value).toBe('no-cache');
    });
  });

  // 5. Basic auth (-u user:pass)
  describe('basic auth', () => {
    it('should parse -u user:pass as basic auth', () => {
      const result = service.importFromString(
        'curl -u admin:secret123 https://api.example.com/protected'
      );
      expect(result.auth?.type).toBe('basic');
      expect(result.auth?.username).toBe('admin');
      expect(result.auth?.password).toBe('secret123');
    });

    it('should parse --user user:pass as basic auth', () => {
      const result = service.importFromString(
        'curl --user myuser:mypass https://api.example.com/protected'
      );
      expect(result.auth?.type).toBe('basic');
      expect(result.auth?.username).toBe('myuser');
      expect(result.auth?.password).toBe('mypass');
    });
  });

  // 6. Bearer token from Authorization header
  describe('bearer token detection', () => {
    it('should detect Bearer token from Authorization header', () => {
      const result = service.importFromString(
        'curl https://api.example.com/me -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.token"'
      );
      expect(result.auth?.type).toBe('bearer');
      expect(result.auth?.token).toBe('eyJhbGciOiJIUzI1NiJ9.test.token');
    });

    it('should remove Authorization header when bearer token is detected', () => {
      const result = service.importFromString(
        'curl https://api.example.com/me -H "Authorization: Bearer my-token" -H "Accept: application/json"'
      );
      const headers = result.headers || [];
      const authHeader = headers.find((h) => h.key.toLowerCase() === 'authorization');
      expect(authHeader).toBeUndefined();
      expect(headers.find((h) => h.key === 'Accept')).toBeDefined();
    });
  });

  // 7. Form data (-F)
  describe('form data', () => {
    it('should parse -F form fields', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/upload -F "name=John" -F "file=@photo.jpg"'
      );
      expect(result.method).toBe('POST');
      expect(result.body?.type).toBe('form-data');
      const formData = JSON.parse(result.body?.content || '[]');
      expect(formData.length).toBe(2);

      const nameField = formData.find((f: any) => f.key === 'name');
      expect(nameField?.value).toBe('John');

      const fileField = formData.find((f: any) => f.key === 'file');
      expect(fileField?.value).toBe('@photo.jpg');
    });

    it('should parse --form fields', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/upload --form "field1=value1"'
      );
      expect(result.body?.type).toBe('form-data');
      const formData = JSON.parse(result.body?.content || '[]');
      expect(formData.length).toBe(1);
      expect(formData[0].key).toBe('field1');
      expect(formData[0].value).toBe('value1');
    });
  });

  // 8. Cookie (-b)
  describe('cookies', () => {
    it('should parse -b cookie as Cookie header', () => {
      const result = service.importFromString(
        'curl -b "session=abc123; theme=dark" https://api.example.com/dashboard'
      );
      const headers = result.headers || [];
      const cookieHeader = headers.find((h) => h.key === 'Cookie');
      expect(cookieHeader?.value).toBe('session=abc123; theme=dark');
    });

    it('should parse --cookie as Cookie header', () => {
      const result = service.importFromString(
        'curl --cookie "token=xyz" https://api.example.com/data'
      );
      const headers = result.headers || [];
      const cookieHeader = headers.find((h) => h.key === 'Cookie');
      expect(cookieHeader?.value).toBe('token=xyz');
    });
  });

  // 9. URL query param extraction
  describe('query param extraction', () => {
    it('should extract query params from URL', () => {
      const result = service.importFromString(
        'curl "https://api.example.com/search?q=hello&page=1&limit=20"'
      );
      expect(result.url).toBe('https://api.example.com/search');
      const params = result.params || [];
      expect(params.length).toBe(3);

      const qParam = params.find((p) => p.key === 'q');
      expect(qParam?.value).toBe('hello');

      const pageParam = params.find((p) => p.key === 'page');
      expect(pageParam?.value).toBe('1');

      const limitParam = params.find((p) => p.key === 'limit');
      expect(limitParam?.value).toBe('20');
    });

    it('should strip query params from the URL', () => {
      const result = service.importFromString(
        'curl "https://api.example.com/search?q=test"'
      );
      expect(result.url).not.toContain('?');
    });
  });

  // 10. Body type detection (JSON, text, url-encoded)
  describe('body type detection', () => {
    it('should detect JSON body type from Content-Type header', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/data -H "Content-Type: application/json" -d \'{"key":"value"}\''
      );
      expect(result.body?.type).toBe('json');
    });

    it('should detect url-encoded body type from Content-Type header', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/login -H "Content-Type: application/x-www-form-urlencoded" -d "username=admin&password=secret"'
      );
      expect(result.body?.type).toBe('x-www-form-urlencoded');
    });

    it('should detect text body type from Content-Type header', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/text -H "Content-Type: text/plain" -d "Hello world"'
      );
      expect(result.body?.type).toBe('text');
    });

    it('should auto-detect JSON from content shape when no Content-Type', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/data -d \'{"key":"value"}\''
      );
      expect(result.body?.type).toBe('json');
    });

    it('should auto-detect JSON array from content shape', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/data -d \'[1,2,3]\''
      );
      expect(result.body?.type).toBe('json');
    });

    it('should fall back to text when content is not JSON-like and no Content-Type', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/data -d "plain text content"'
      );
      expect(result.body?.type).toBe('text');
    });
  });

  // 11. Line continuation with backslash
  describe('line continuation', () => {
    it('should handle backslash line continuations', () => {
      const curlCmd = `curl -X POST \\\nhttps://api.example.com/users \\\n-H "Content-Type: application/json" \\\n-d '{"name":"John"}'`;
      const result = service.importFromString(curlCmd);
      expect(result.method).toBe('POST');
      expect(result.url).toBe('https://api.example.com/users');
      expect(result.body?.content).toBe('{"name":"John"}');
    });

    it('should handle backslash line continuations with carriage return', () => {
      const curlCmd = `curl -X GET \\\r\nhttps://api.example.com/users`;
      const result = service.importFromString(curlCmd);
      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://api.example.com/users');
    });
  });

  // 12. Quoted strings (single and double)
  describe('quoted strings', () => {
    it('should handle double-quoted URL', () => {
      const result = service.importFromString(
        'curl "https://api.example.com/data?key=value"'
      );
      expect(result.url).toBe('https://api.example.com/data');
      expect(result.params?.find((p) => p.key === 'key')?.value).toBe('value');
    });

    it('should handle single-quoted body', () => {
      const result = service.importFromString(
        "curl -X POST https://api.example.com/data -d '{\"name\":\"test\"}'"
      );
      expect(result.body?.content).toBe('{"name":"test"}');
    });

    it('should handle double-quoted header values with spaces', () => {
      const result = service.importFromString(
        'curl https://api.example.com -H "X-Token: abc def ghi"'
      );
      const headers = result.headers || [];
      const tokenHeader = headers.find((h) => h.key === 'X-Token');
      expect(tokenHeader?.value).toBe('abc def ghi');
    });
  });

  // 13. Not a curl command (error)
  describe('invalid input', () => {
    it('should throw error for non-curl command', () => {
      expect(() => service.importFromString('wget https://example.com')).toThrow('Not a cURL command');
    });

    it('should throw error for empty string', () => {
      expect(() => service.importFromString('')).toThrow();
    });
  });

  // 14. importFromString returns SavedRequest
  describe('importFromString return shape', () => {
    it('should return a valid SavedRequest object', () => {
      const result = service.importFromString('curl https://api.example.com/users');
      expect(result).toHaveProperty('method');
      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('createdAt');
      expect(result).toHaveProperty('updatedAt');
      expect(result.type).toBe('request');
    });

    it('should generate a unique id for each import', () => {
      const result1 = service.importFromString('curl https://api.example.com/users');
      const result2 = service.importFromString('curl https://api.example.com/users');
      expect(result1.id).not.toBe(result2.id);
    });
  });

  // 15. nameFromUrl extracts last path segment
  describe('nameFromUrl', () => {
    it('should use last path segment as request name', () => {
      const result = service.importFromString('curl https://api.example.com/v1/users');
      expect(result.name).toBe('users');
    });

    it('should use last non-empty path segment', () => {
      const result = service.importFromString('curl https://api.example.com/v1/items/');
      expect(result.name).toBe('items');
    });

    it('should use a deeper path segment correctly', () => {
      const result = service.importFromString('curl https://api.example.com/api/v2/organizations/members');
      expect(result.name).toBe('members');
    });
  });

  // 16. nameFromUrl with invalid URL returns default
  describe('nameFromUrl with edge cases', () => {
    it('should use hostname for root path URL', () => {
      const result = service.importFromString('curl https://api.example.com');
      expect(result.name).toBe('api.example.com');
    });

    it('should use hostname for URL with only trailing slash', () => {
      const result = service.importFromString('curl https://api.example.com/');
      expect(result.name).toBe('api.example.com');
    });
  });

  // 17. Multiple -d flags (last wins)
  describe('multiple -d flags', () => {
    it('should use the last -d value when multiple are provided', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/data -d "first=1" -d "second=2"'
      );
      expect(result.body?.content).toBe('second=2');
    });
  });

  // 18. Flags with values that skip next token (-o output.txt)
  describe('flags with consumed values', () => {
    it('should skip -o and its value argument', () => {
      const result = service.importFromString(
        'curl -o output.txt https://api.example.com/file'
      );
      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://api.example.com/file');
    });

    it('should skip --output and its value argument', () => {
      const result = service.importFromString(
        'curl --output result.json https://api.example.com/data'
      );
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('should skip --connect-timeout and its value', () => {
      const result = service.importFromString(
        'curl --connect-timeout 30 https://api.example.com/slow'
      );
      expect(result.url).toBe('https://api.example.com/slow');
    });

    it('should skip -m and its value', () => {
      const result = service.importFromString(
        'curl -m 60 https://api.example.com/data'
      );
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('should skip --max-time and its value', () => {
      const result = service.importFromString(
        'curl --max-time 120 https://api.example.com/data'
      );
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('should skip -w / --write-out and its value', () => {
      const result = service.importFromString(
        'curl -w "%{http_code}" https://api.example.com/status'
      );
      expect(result.url).toBe('https://api.example.com/status');
    });
  });

  // 19. Auto POST when -d present without -X
  describe('auto POST with -d', () => {
    it('should default to POST when -d is used without -X', () => {
      const result = service.importFromString(
        'curl https://api.example.com/data -d "key=value"'
      );
      expect(result.method).toBe('POST');
    });

    it('should default to POST when --data is used without -X', () => {
      const result = service.importFromString(
        'curl https://api.example.com/data --data "payload=test"'
      );
      expect(result.method).toBe('POST');
    });

    it('should not override explicit -X GET even with -d', () => {
      const result = service.importFromString(
        'curl -X GET https://api.example.com/data -d "payload=test"'
      );
      expect(result.method).toBe('GET');
    });

    it('should default to POST when -F is used without -X', () => {
      const result = service.importFromString(
        'curl https://api.example.com/upload -F "file=@test.txt"'
      );
      expect(result.method).toBe('POST');
    });
  });

  // 20. --data-raw and --data-binary variants
  describe('data variants', () => {
    it('should parse --data-raw', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/data --data-raw \'{"raw":true}\''
      );
      expect(result.body?.content).toBe('{"raw":true}');
      expect(result.method).toBe('POST');
    });

    it('should parse --data-binary', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/upload --data-binary "@file.bin"'
      );
      expect(result.body?.content).toBe('@file.bin');
    });

    it('should parse --data-ascii', () => {
      const result = service.importFromString(
        'curl -X POST https://api.example.com/data --data-ascii "hello world"'
      );
      expect(result.body?.content).toBe('hello world');
    });
  });

  // importFromFile
  describe('importFromFile', () => {
    it('should read file and parse its content', async () => {
      const curlContent = 'curl -X GET https://api.example.com/users';
      (fs.promises.readFile as jest.Mock).mockResolvedValue(curlContent);

      const result = await service.importFromFile('/path/to/curl.txt');
      expect(fs.promises.readFile).toHaveBeenCalledWith('/path/to/curl.txt', 'utf-8');
      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://api.example.com/users');
      expect(result.type).toBe('request');
    });

    it('should throw if file read fails', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValue(new Error('File not found'));
      await expect(service.importFromFile('/nonexistent/file.txt')).rejects.toThrow('File not found');
    });
  });

  // Ignored boolean flags
  describe('ignored flags', () => {
    it('should ignore -L, -s, -k, -v, -i, --compressed without affecting result', () => {
      const result = service.importFromString(
        'curl -L -s -k -v -i --compressed https://api.example.com/data'
      );
      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('should ignore long-form flags --location --silent --insecure --verbose --include', () => {
      const result = service.importFromString(
        'curl --location --silent --insecure --verbose --include https://api.example.com/data'
      );
      expect(result.method).toBe('GET');
      expect(result.url).toBe('https://api.example.com/data');
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('should handle curl command with extra whitespace', () => {
      const result = service.importFromString('  curl   https://api.example.com/data  ');
      expect(result.url).toBe('https://api.example.com/data');
    });

    it('should set body type to none when no body is provided', () => {
      const result = service.importFromString('curl https://api.example.com/data');
      expect(result.body?.type).toBe('none');
      expect(result.body?.content).toBe('');
    });

    it('should parse basic auth with no password (user only)', () => {
      const result = service.importFromString(
        'curl -u admin https://api.example.com/protected'
      );
      expect(result.auth?.type).toBe('basic');
      expect(result.auth?.username).toBe('admin');
      expect(result.auth?.password).toBe('');
    });

    it('should handle password containing colons', () => {
      const result = service.importFromString(
        'curl -u user:pass:with:colons https://api.example.com/protected'
      );
      expect(result.auth?.type).toBe('basic');
      expect(result.auth?.username).toBe('user');
      expect(result.auth?.password).toBe('pass:with:colons');
    });

    it('should handle header with no value after colon', () => {
      const result = service.importFromString(
        'curl https://api.example.com -H "X-Empty:"'
      );
      const headers = result.headers || [];
      const emptyHeader = headers.find((h) => h.key === 'X-Empty');
      expect(emptyHeader?.value).toBe('');
    });
  });
});
