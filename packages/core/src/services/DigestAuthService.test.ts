import { parseDigestChallenge, computeDigestAuth } from './DigestAuthService';

describe('DigestAuthService', () => {
  describe('parseDigestChallenge', () => {
    it('should parse a standard Digest challenge', () => {
      const header = 'Digest realm="test@example.com", nonce="abc123", qop="auth", opaque="xyz789"';
      const result = parseDigestChallenge(header);
      expect(result).toEqual({
        realm: 'test@example.com',
        nonce: 'abc123',
        qop: 'auth',
        opaque: 'xyz789',
        algorithm: undefined,
        stale: false,
      });
    });

    it('should parse challenge with algorithm', () => {
      const header = 'Digest realm="api", nonce="n1", algorithm=SHA-256, qop="auth"';
      const result = parseDigestChallenge(header);
      expect(result).not.toBeNull();
      expect(result!.algorithm).toBe('SHA-256');
      expect(result!.realm).toBe('api');
    });

    it('should return null for non-Digest header', () => {
      expect(parseDigestChallenge('Basic realm="test"')).toBeNull();
    });

    it('should return null for missing realm', () => {
      expect(parseDigestChallenge('Digest nonce="abc"')).toBeNull();
    });

    it('should return null for missing nonce', () => {
      expect(parseDigestChallenge('Digest realm="test"')).toBeNull();
    });

    it('should handle stale=true', () => {
      const header = 'Digest realm="test", nonce="n1", stale=true';
      const result = parseDigestChallenge(header);
      expect(result!.stale).toBe(true);
    });

    it('should handle stale=false', () => {
      const header = 'Digest realm="test", nonce="n1", stale=false';
      const result = parseDigestChallenge(header);
      expect(result!.stale).toBe(false);
    });

    it('should handle multiple qop values', () => {
      const header = 'Digest realm="test", nonce="n1", qop="auth,auth-int"';
      const result = parseDigestChallenge(header);
      expect(result!.qop).toBe('auth,auth-int');
    });

    it('should be case-insensitive for the Digest prefix', () => {
      const header = 'DIGEST realm="test", nonce="n1"';
      const result = parseDigestChallenge(header);
      expect(result).not.toBeNull();
      expect(result!.realm).toBe('test');
    });
  });

  describe('computeDigestAuth', () => {
    it('should compute MD5 digest with qop=auth', () => {
      const result = computeDigestAuth({
        username: 'user',
        password: 'pass',
        method: 'GET',
        uri: '/api/data',
        challenge: {
          realm: 'test@example.com',
          nonce: 'abc123',
          qop: 'auth',
        },
      });

      expect(result).toMatch(/^Digest /);
      expect(result).toContain('username="user"');
      expect(result).toContain('realm="test@example.com"');
      expect(result).toContain('nonce="abc123"');
      expect(result).toContain('uri="/api/data"');
      expect(result).toContain('qop=auth');
      expect(result).toContain('nc=00000001');
      expect(result).toMatch(/cnonce="[a-f0-9]+"/);
      expect(result).toMatch(/response="[a-f0-9]{32}"/);
      expect(result).toContain('algorithm=MD5');
    });

    it('should compute digest without qop', () => {
      const result = computeDigestAuth({
        username: 'admin',
        password: 'secret',
        method: 'POST',
        uri: '/login',
        challenge: {
          realm: 'myapp',
          nonce: 'nonce123',
        },
      });

      expect(result).toMatch(/^Digest /);
      expect(result).toContain('username="admin"');
      expect(result).not.toContain('qop=');
      expect(result).not.toContain('nc=');
      expect(result).not.toContain('cnonce=');
      expect(result).toMatch(/response="[a-f0-9]{32}"/);
    });

    it('should include opaque when present', () => {
      const result = computeDigestAuth({
        username: 'user',
        password: 'pass',
        method: 'GET',
        uri: '/',
        challenge: {
          realm: 'test',
          nonce: 'n1',
          opaque: 'opaque_val',
        },
      });

      expect(result).toContain('opaque="opaque_val"');
    });

    it('should use SHA-256 when specified', () => {
      const result = computeDigestAuth({
        username: 'user',
        password: 'pass',
        method: 'GET',
        uri: '/secure',
        challenge: {
          realm: 'secure-realm',
          nonce: 'sha-nonce',
          qop: 'auth',
          algorithm: 'SHA-256',
        },
      });

      expect(result).toContain('algorithm=SHA-256');
      // SHA-256 produces 64-char hex digest
      expect(result).toMatch(/response="[a-f0-9]{64}"/);
    });

    it('should select auth from multiple qop values', () => {
      const result = computeDigestAuth({
        username: 'user',
        password: 'pass',
        method: 'GET',
        uri: '/',
        challenge: {
          realm: 'test',
          nonce: 'n1',
          qop: 'auth, auth-int',
        },
      });

      expect(result).toContain('qop=auth');
      expect(result).toContain('nc=00000001');
    });

    it('should produce a valid Authorization header format', () => {
      const result = computeDigestAuth({
        username: 'user',
        password: 'pass',
        method: 'GET',
        uri: '/test',
        challenge: {
          realm: 'realm',
          nonce: 'nonce',
          qop: 'auth',
          opaque: 'opaque',
          algorithm: 'MD5',
        },
      });

      // Should start with "Digest " and contain comma-separated key=value pairs
      expect(result.startsWith('Digest ')).toBe(true);
      const parts = result.substring(7).split(', ');
      expect(parts.length).toBeGreaterThanOrEqual(8); // username, realm, nonce, uri, algorithm, qop, nc, cnonce, response, opaque
    });
  });
});
