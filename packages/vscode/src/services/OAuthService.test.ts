import { OAuthService } from './OAuthService';
import * as http from 'http';

// Mock token server
let mockServer: http.Server;
let mockServerPort: number;
let lastRequestBody: string;
let mockResponseData: object;
let mockResponseStatus: number;

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      mockServer = http.createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          lastRequestBody = body;
          res.writeHead(mockResponseStatus, {
            'Content-Type': 'application/json',
          });
          res.end(JSON.stringify(mockResponseData));
        });
      });
      mockServer.listen(0, () => {
        const addr = mockServer.address() as { port: number };
        mockServerPort = addr.port;
        resolve();
      });
    })
);

afterAll(
  () =>
    new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    })
);

beforeEach(() => {
  lastRequestBody = '';
  mockResponseData = {
    access_token: 'mock-access-token',
    token_type: 'Bearer',
    expires_in: 3600,
    refresh_token: 'mock-refresh-token',
    scope: 'read write',
  };
  mockResponseStatus = 200;
});

function tokenUrl(): string {
  return `http://127.0.0.1:${mockServerPort}/token`;
}

describe('OAuthService', () => {
  let service: OAuthService;

  beforeEach(() => {
    service = new OAuthService();
  });

  afterEach(() => {
    service.dispose();
  });

  // ─── isTokenExpired ────────────────────────────────────────

  describe('isTokenExpired', () => {
    it('returns false when no expiresAt', () => {
      const token = {
        accessToken: 'abc',
        tokenType: 'Bearer',
      };
      expect(service.isTokenExpired(token)).toBe(false);
    });

    it('returns false when token not expired', () => {
      const token = {
        accessToken: 'abc',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 120_000, // 2 minutes from now
      };
      expect(service.isTokenExpired(token)).toBe(false);
    });

    it('returns true when token expired', () => {
      const token = {
        accessToken: 'abc',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 60_000, // 1 minute ago
      };
      expect(service.isTokenExpired(token)).toBe(true);
    });

    it('returns true when within 30s buffer', () => {
      const token = {
        accessToken: 'abc',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 15_000, // 15 seconds from now (within 30s buffer)
      };
      expect(service.isTokenExpired(token)).toBe(true);
    });
  });

  // ─── getTokenKey ───────────────────────────────────────────

  describe('getTokenKey', () => {
    it('returns consistent hash for same config', () => {
      const config = {
        grantType: 'authorization_code' as const,
        clientId: 'my-client',
        authUrl: 'https://auth.example.com/authorize',
      };
      const key1 = service.getTokenKey(config);
      const key2 = service.getTokenKey(config);
      expect(key1).toBe(key2);
    });

    it('returns different hash for different config', () => {
      const config1 = {
        grantType: 'authorization_code' as const,
        clientId: 'client-a',
        authUrl: 'https://auth.example.com/authorize',
      };
      const config2 = {
        grantType: 'authorization_code' as const,
        clientId: 'client-b',
        authUrl: 'https://auth.example.com/authorize',
      };
      expect(service.getTokenKey(config1)).not.toBe(service.getTokenKey(config2));
    });

    it('returns 16-char hex string', () => {
      const config = {
        grantType: 'client_credentials' as const,
        clientId: 'test-client',
        authUrl: 'https://example.com/auth',
      };
      const key = service.getTokenKey(config);
      expect(key).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  // ─── dispose ───────────────────────────────────────────────

  describe('dispose', () => {
    it('does not throw when no server running', () => {
      expect(() => service.dispose()).not.toThrow();
    });

    it('can be called multiple times', () => {
      expect(() => {
        service.dispose();
        service.dispose();
        service.dispose();
      }).not.toThrow();
    });
  });

  // ─── clientCredentialsFlow ─────────────────────────────────

  describe('clientCredentialsFlow', () => {
    it('throws when tokenUrl is missing', async () => {
      const config = {
        grantType: 'client_credentials' as const,
        clientId: 'my-client',
        clientSecret: 'my-secret',
      };
      await expect(service.clientCredentialsFlow(config)).rejects.toThrow();
    });

    it('successfully exchanges credentials via mock HTTP server', async () => {
      const config = {
        grantType: 'client_credentials' as const,
        clientId: 'my-client',
        clientSecret: 'my-secret',
        tokenUrl: tokenUrl(),
      };

      const token = await service.clientCredentialsFlow(config);

      expect(token.accessToken).toBe('mock-access-token');
      expect(token.tokenType).toBe('Bearer');
      expect(token.refreshToken).toBe('mock-refresh-token');

      const params = new URLSearchParams(lastRequestBody);
      expect(params.get('grant_type')).toBe('client_credentials');
      expect(params.get('client_id')).toBe('my-client');
      expect(params.get('client_secret')).toBe('my-secret');
    });

    it('includes scope when provided', async () => {
      const config = {
        grantType: 'client_credentials' as const,
        clientId: 'my-client',
        clientSecret: 'my-secret',
        tokenUrl: tokenUrl(),
        scope: 'read write admin',
      };

      await service.clientCredentialsFlow(config);

      const params = new URLSearchParams(lastRequestBody);
      expect(params.get('scope')).toBe('read write admin');
    });

    it('handles error response from token endpoint', async () => {
      mockResponseStatus = 400;
      mockResponseData = {
        error: 'invalid_client',
        error_description: 'Client authentication failed',
      };

      const config = {
        grantType: 'client_credentials' as const,
        clientId: 'bad-client',
        clientSecret: 'bad-secret',
        tokenUrl: tokenUrl(),
      };

      await expect(service.clientCredentialsFlow(config)).rejects.toThrow();
    });
  });

  // ─── passwordFlow ──────────────────────────────────────────

  describe('passwordFlow', () => {
    it('throws when tokenUrl is missing', async () => {
      const config = {
        grantType: 'password' as const,
        clientId: 'my-client',
        username: 'user',
        password: 'pass',
      };
      await expect(service.passwordFlow(config)).rejects.toThrow();
    });

    it('throws when username/password missing', async () => {
      const config = {
        grantType: 'password' as const,
        clientId: 'my-client',
        tokenUrl: tokenUrl(),
      };
      await expect(service.passwordFlow(config)).rejects.toThrow();
    });

    it('successfully exchanges password credentials via mock HTTP server', async () => {
      const config = {
        grantType: 'password' as const,
        clientId: 'my-client',
        clientSecret: 'my-secret',
        tokenUrl: tokenUrl(),
        username: 'testuser',
        password: 'testpass',
      };

      const token = await service.passwordFlow(config);

      expect(token.accessToken).toBe('mock-access-token');
      expect(token.tokenType).toBe('Bearer');

      const params = new URLSearchParams(lastRequestBody);
      expect(params.get('grant_type')).toBe('password');
      expect(params.get('username')).toBe('testuser');
      expect(params.get('password')).toBe('testpass');
      expect(params.get('client_id')).toBe('my-client');
      expect(params.get('client_secret')).toBe('my-secret');
    });
  });

  // ─── refreshToken ──────────────────────────────────────────

  describe('refreshToken', () => {
    it('successfully refreshes token via mock HTTP server', async () => {
      const token = await service.refreshToken(
        tokenUrl(),
        'my-client',
        undefined,
        'old-refresh-token'
      );

      expect(token.accessToken).toBe('mock-access-token');
      expect(token.tokenType).toBe('Bearer');

      const params = new URLSearchParams(lastRequestBody);
      expect(params.get('grant_type')).toBe('refresh_token');
      expect(params.get('refresh_token')).toBe('old-refresh-token');
      expect(params.get('client_id')).toBe('my-client');
    });

    it('includes client_secret when provided', async () => {
      await service.refreshToken(
        tokenUrl(),
        'my-client',
        'my-secret',
        'old-refresh-token'
      );

      const params = new URLSearchParams(lastRequestBody);
      expect(params.get('client_secret')).toBe('my-secret');
    });
  });

  // ─── startAuthorizationCodeFlow ────────────────────────────

  describe('startAuthorizationCodeFlow', () => {
    it('returns auth URL with correct params', async () => {
      const config = {
        grantType: 'authorization_code' as const,
        clientId: 'my-client',
        authUrl: 'https://auth.example.com/authorize',
        tokenUrl: tokenUrl(),
        scope: 'openid profile',
        state: 'my-state',
      };

      const onToken = jest.fn();
      const onError = jest.fn();
      const authUrl = await service.startAuthorizationCodeFlow(config, onToken, onError);

      const parsed = new URL(authUrl);
      expect(parsed.origin + parsed.pathname).toBe('https://auth.example.com/authorize');
      expect(parsed.searchParams.get('client_id')).toBe('my-client');
      expect(parsed.searchParams.get('response_type')).toBe('code');
      expect(parsed.searchParams.get('scope')).toBe('openid profile');
      expect(parsed.searchParams.get('redirect_uri')).toContain('http://');
      expect(parsed.searchParams.get('state')).toBeTruthy();
    });

    it('auth URL includes PKCE params when usePkce is true', async () => {
      const config = {
        grantType: 'authorization_code' as const,
        clientId: 'my-client',
        authUrl: 'https://auth.example.com/authorize',
        tokenUrl: tokenUrl(),
        usePkce: true,
      };

      const onToken = jest.fn();
      const onError = jest.fn();
      const authUrl = await service.startAuthorizationCodeFlow(config, onToken, onError);

      const parsed = new URL(authUrl);
      expect(parsed.searchParams.get('code_challenge')).toBeTruthy();
      expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('handles callback with error param', async () => {
      const config = {
        grantType: 'authorization_code' as const,
        clientId: 'my-client',
        authUrl: 'https://auth.example.com/authorize',
        tokenUrl: tokenUrl(),
      };

      const onToken = jest.fn();
      const onError = jest.fn();
      const authUrl = await service.startAuthorizationCodeFlow(config, onToken, onError);

      // Extract the callback base URL from the redirect_uri
      const parsed = new URL(authUrl);
      const redirectUri = parsed.searchParams.get('redirect_uri')!;
      const callbackUrl = new URL(redirectUri);

      // Make a request to the callback with an error
      await new Promise<void>((resolve) => {
        const errorUrl = `http://127.0.0.1:${callbackUrl.port}/callback?error=access_denied&error_description=User+denied+access`;
        http.get(errorUrl, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve());
        });
      });

      // Give async handlers time to fire
      await new Promise((r) => setTimeout(r, 100));
      expect(onError).toHaveBeenCalled();
    });

    it('handles callback with no code', async () => {
      const config = {
        grantType: 'authorization_code' as const,
        clientId: 'my-client',
        authUrl: 'https://auth.example.com/authorize',
        tokenUrl: tokenUrl(),
      };

      const onToken = jest.fn();
      const onError = jest.fn();
      const authUrl = await service.startAuthorizationCodeFlow(config, onToken, onError);

      const parsed = new URL(authUrl);
      const redirectUri = parsed.searchParams.get('redirect_uri')!;
      const callbackUrl = new URL(redirectUri);

      // Make a request to the callback with no code and no error
      await new Promise<void>((resolve) => {
        const noCodeUrl = `http://127.0.0.1:${callbackUrl.port}/callback`;
        http.get(noCodeUrl, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve());
        });
      });

      await new Promise((r) => setTimeout(r, 100));
      expect(onError).toHaveBeenCalled();
    });

    it('implicit flow uses /implicit-callback path', async () => {
      const config = {
        grantType: 'implicit' as const,
        clientId: 'my-client',
        authUrl: 'https://auth.example.com/authorize',
      };

      const onToken = jest.fn();
      const onError = jest.fn();
      const authUrl = await service.startAuthorizationCodeFlow(config, onToken, onError);

      const parsed = new URL(authUrl);
      const redirectUri = parsed.searchParams.get('redirect_uri')!;
      expect(redirectUri).toContain('/implicit-callback');
      expect(parsed.searchParams.get('response_type')).toBe('token');
    });

    it('handles successful code exchange', async () => {
      const config = {
        grantType: 'authorization_code' as const,
        clientId: 'my-client',
        clientSecret: 'my-secret',
        authUrl: 'https://auth.example.com/authorize',
        tokenUrl: tokenUrl(),
      };

      const onToken = jest.fn();
      const onError = jest.fn();
      const authUrl = await service.startAuthorizationCodeFlow(config, onToken, onError);

      const parsed = new URL(authUrl);
      const redirectUri = parsed.searchParams.get('redirect_uri')!;
      const callbackUrl = new URL(redirectUri);
      const state = parsed.searchParams.get('state');

      // Make a request to the callback with a valid code
      await new Promise<void>((resolve) => {
        const codeUrl = `http://127.0.0.1:${callbackUrl.port}/callback?code=auth-code-123&state=${state}`;
        http.get(codeUrl, (res) => {
          let body = '';
          res.on('data', (chunk) => (body += chunk));
          res.on('end', () => resolve());
        });
      });

      // Wait for the token exchange to complete
      await new Promise((r) => setTimeout(r, 500));

      expect(onToken).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'mock-access-token',
          tokenType: 'Bearer',
        })
      );

      // Verify the token request was sent correctly
      const params = new URLSearchParams(lastRequestBody);
      expect(params.get('grant_type')).toBe('authorization_code');
      expect(params.get('code')).toBe('auth-code-123');
      expect(params.get('client_id')).toBe('my-client');
      expect(params.get('client_secret')).toBe('my-secret');
      expect(params.get('redirect_uri')).toBeTruthy();
    });

    it('auto-closes after dispose', async () => {
      const config = {
        grantType: 'authorization_code' as const,
        clientId: 'my-client',
        authUrl: 'https://auth.example.com/authorize',
        tokenUrl: tokenUrl(),
      };

      const onToken = jest.fn();
      const onError = jest.fn();
      const authUrl = await service.startAuthorizationCodeFlow(config, onToken, onError);

      const parsed = new URL(authUrl);
      const redirectUri = parsed.searchParams.get('redirect_uri')!;
      const callbackUrl = new URL(redirectUri);

      // Dispose the service (closes the callback server)
      service.dispose();

      // Wait a moment for server to close
      await new Promise((r) => setTimeout(r, 100));

      // Attempting to connect should fail
      await expect(
        new Promise<void>((resolve, reject) => {
          const req = http.get(
            `http://127.0.0.1:${callbackUrl.port}/callback?code=test`,
            () => resolve()
          );
          req.on('error', (err) => reject(err));
        })
      ).rejects.toThrow();
    });
  });
});
