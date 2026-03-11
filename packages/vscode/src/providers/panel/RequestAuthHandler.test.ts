const mockHttpntlm = {
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};
jest.mock('httpntlm', () => mockHttpntlm);

import { RequestAuthHandler, AuthApplyResult } from './RequestAuthHandler';

// --- Helpers ---

function createMockOAuthService() {
  return {
    isTokenExpired: jest.fn().mockReturnValue(false),
    refreshToken: jest.fn(),
    clientCredentialsFlow: jest.fn(),
    passwordFlow: jest.fn(),
    startAuthorizationCodeFlow: jest.fn(),
  };
}

function createMockAwsSignatureService() {
  return {
    sign: jest.fn().mockReturnValue({
      Authorization: 'AWS4-HMAC-SHA256 ...',
      'x-amz-date': '20260311T000000Z',
      'x-amz-content-sha256': 'abc123',
    }),
  };
}

function createHandler(overrides: { oauth?: any; aws?: any } = {}) {
  const oauthService = overrides.oauth ?? createMockOAuthService();
  const awsService = overrides.aws ?? createMockAwsSignatureService();
  const handler = new RequestAuthHandler(oauthService as any, awsService as any);
  return { handler, oauthService, awsService };
}

const defaultConfig = { method: 'GET', url: 'https://api.example.com/data' };

// --- Tests ---

describe('RequestAuthHandler', () => {
  describe('applyAuth', () => {
    it('returns empty result when auth is null', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(null, {}, {}, defaultConfig);

      expect(result.headerUpdates).toEqual({});
      expect(result.paramUpdates).toEqual({});
      expect(result.authConfig).toBeUndefined();
      expect(result.ntlmAuth).toBeUndefined();
      expect(result.digestAuth).toBeUndefined();
      expect(result.tokenRefreshed).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it('returns empty result when auth is undefined', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(undefined, {}, {}, defaultConfig);

      expect(result.headerUpdates).toEqual({});
      expect(result.paramUpdates).toEqual({});
    });

    // --- Bearer auth ---

    it('sets Authorization header for bearer auth', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'bearer', token: 'my-jwt-token' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer my-jwt-token' });
    });

    it('does not set header for bearer auth with missing token', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'bearer' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({});
    });

    it('does not set header for bearer auth with empty string token', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'bearer', token: '' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({});
    });

    // --- Basic auth ---

    it('returns authConfig for basic auth', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'basic', username: 'user', password: 'pass' },
        {}, {}, defaultConfig
      );

      expect(result.authConfig).toEqual({ username: 'user', password: 'pass' });
      expect(result.headerUpdates).toEqual({});
    });

    it('defaults password to empty string for basic auth', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'basic', username: 'user' },
        {}, {}, defaultConfig
      );

      expect(result.authConfig).toEqual({ username: 'user', password: '' });
    });

    it('does not set authConfig for basic auth with missing username', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'basic', password: 'pass' },
        {}, {}, defaultConfig
      );

      expect(result.authConfig).toBeUndefined();
    });

    // --- API Key auth ---

    it('sets header for apikey auth (default location)', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: 'secret123' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({ 'X-API-Key': 'secret123' });
      expect(result.paramUpdates).toEqual({});
    });

    it('sets header for apikey auth when apiKeyIn is "header"', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'apikey', apiKeyName: 'X-API-Key', apiKeyValue: 'secret', apiKeyIn: 'header' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({ 'X-API-Key': 'secret' });
      expect(result.paramUpdates).toEqual({});
    });

    it('sets query param for apikey auth when apiKeyIn is "query"', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'apikey', apiKeyName: 'api_key', apiKeyValue: 'secret', apiKeyIn: 'query' },
        {}, {}, defaultConfig
      );

      expect(result.paramUpdates).toEqual({ api_key: 'secret' });
      expect(result.headerUpdates).toEqual({});
    });

    it('does not set apikey when apiKeyName is missing', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'apikey', apiKeyValue: 'secret' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({});
      expect(result.paramUpdates).toEqual({});
    });

    it('does not set apikey when apiKeyValue is missing', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'apikey', apiKeyName: 'X-API-Key' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({});
      expect(result.paramUpdates).toEqual({});
    });

    // --- AWS Signature auth ---

    it('signs request with AWS Signature V4', async () => {
      const { handler, awsService } = createHandler();
      const headers = { 'Content-Type': 'application/json' };
      const result = await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA...', awsSecretKey: 'secret', awsRegion: 'us-west-2', awsService: 'execute-api' },
        headers, {}, { method: 'POST', url: 'https://api.aws.com/resource', data: '{"key":"val"}' }
      );

      expect(awsService.sign).toHaveBeenCalledWith(
        {
          method: 'POST',
          url: 'https://api.aws.com/resource',
          headers: { 'Content-Type': 'application/json' },
          body: '{"key":"val"}',
        },
        {
          accessKey: 'AKIA...',
          secretKey: 'secret',
          region: 'us-west-2',
          service: 'execute-api',
          sessionToken: undefined,
        }
      );
      expect(result.headerUpdates).toEqual({
        Authorization: 'AWS4-HMAC-SHA256 ...',
        'x-amz-date': '20260311T000000Z',
        'x-amz-content-sha256': 'abc123',
      });
    });

    it('defaults AWS region to us-east-1 and service to s3', async () => {
      const { handler, awsService } = createHandler();
      await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA', awsSecretKey: 'secret' },
        {}, {}, defaultConfig
      );

      expect(awsService.sign).toHaveBeenCalledTimes(1);
      const signConfig = awsService.sign.mock.calls[0][1];
      expect(signConfig.region).toBe('us-east-1');
      expect(signConfig.service).toBe('s3');
    });

    it('passes sessionToken when provided for AWS auth', async () => {
      const { handler, awsService } = createHandler();
      await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA', awsSecretKey: 'secret', awsSessionToken: 'session-tok' },
        {}, {}, defaultConfig
      );

      const signConfig = awsService.sign.mock.calls[0][1];
      expect(signConfig.sessionToken).toBe('session-tok');
    });

    it('passes undefined sessionToken when awsSessionToken is empty', async () => {
      const { handler, awsService } = createHandler();
      await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA', awsSecretKey: 'secret', awsSessionToken: '' },
        {}, {}, defaultConfig
      );

      const signConfig = awsService.sign.mock.calls[0][1];
      expect(signConfig.sessionToken).toBeUndefined();
    });

    it('serializes object body to JSON for AWS signing', async () => {
      const { handler, awsService } = createHandler();
      const dataObj = { foo: 'bar' };
      await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA', awsSecretKey: 'secret' },
        {}, {}, { method: 'POST', url: 'https://api.example.com', data: dataObj }
      );

      const signRequest = awsService.sign.mock.calls[0][0];
      expect(signRequest.body).toBe(JSON.stringify(dataObj));
    });

    it('passes empty string body when data is undefined for AWS signing', async () => {
      const { handler, awsService } = createHandler();
      await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA', awsSecretKey: 'secret' },
        {}, {}, { method: 'GET', url: 'https://api.example.com' }
      );

      const signRequest = awsService.sign.mock.calls[0][0];
      expect(signRequest.body).toBe('');
    });

    it('does not sign when awsAccessKey is missing', async () => {
      const { handler, awsService } = createHandler();
      await handler.applyAuth(
        { type: 'aws', awsSecretKey: 'secret' },
        {}, {}, defaultConfig
      );

      expect(awsService.sign).not.toHaveBeenCalled();
    });

    it('does not sign when awsSecretKey is missing', async () => {
      const { handler, awsService } = createHandler();
      await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA' },
        {}, {}, defaultConfig
      );

      expect(awsService.sign).not.toHaveBeenCalled();
    });

    it('spreads existing headers into the sign request (does not mutate originals)', async () => {
      const { handler, awsService } = createHandler();
      const originalHeaders = { 'Content-Type': 'application/json', 'Accept': 'text/html' };
      await handler.applyAuth(
        { type: 'aws', awsAccessKey: 'AKIA', awsSecretKey: 'secret' },
        originalHeaders, {}, { method: 'GET', url: 'https://api.example.com' }
      );

      const signRequest = awsService.sign.mock.calls[0][0];
      expect(signRequest.headers).toEqual({ 'Content-Type': 'application/json', 'Accept': 'text/html' });
      // Ensure it was a copy, not the same reference
      expect(signRequest.headers).not.toBe(originalHeaders);
    });

    // --- NTLM auth ---

    it('returns ntlmAuth for ntlm auth type', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'ntlm', username: 'user', password: 'pass', ntlmDomain: 'CORP', ntlmWorkstation: 'WS01' },
        {}, {}, defaultConfig
      );

      expect(result.ntlmAuth).toEqual({
        username: 'user',
        password: 'pass',
        domain: 'CORP',
        workstation: 'WS01',
      });
    });

    it('defaults ntlm password, domain, and workstation to empty strings', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'ntlm', username: 'user' },
        {}, {}, defaultConfig
      );

      expect(result.ntlmAuth).toEqual({
        username: 'user',
        password: '',
        domain: '',
        workstation: '',
      });
    });

    it('does not set ntlmAuth when username is missing', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'ntlm', password: 'pass' },
        {}, {}, defaultConfig
      );

      expect(result.ntlmAuth).toBeUndefined();
    });

    // --- Digest auth ---

    it('returns digestAuth for digest auth type', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'digest', username: 'user', password: 'pass' },
        {}, {}, defaultConfig
      );

      expect(result.digestAuth).toEqual({ username: 'user', password: 'pass' });
    });

    it('defaults digest password to empty string', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'digest', username: 'user' },
        {}, {}, defaultConfig
      );

      expect(result.digestAuth).toEqual({ username: 'user', password: '' });
    });

    it('does not set digestAuth when username is missing', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'digest', password: 'pass' },
        {}, {}, defaultConfig
      );

      expect(result.digestAuth).toBeUndefined();
    });

    // --- OAuth2 auth ---

    it('sets Bearer header with existing oauthToken', async () => {
      const { handler, oauthService } = createHandler();
      const result = await handler.applyAuth(
        { type: 'oauth2', oauthToken: 'existing-access-token' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer existing-access-token' });
      expect(oauthService.isTokenExpired).not.toHaveBeenCalled();
    });

    it('does not set header when oauthToken is missing and no token data', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'oauth2' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({});
    });

    it('refreshes expired token and uses new access token', async () => {
      const oauthService = createMockOAuthService();
      oauthService.isTokenExpired.mockReturnValue(true);
      const refreshedToken = { accessToken: 'refreshed-token', tokenType: 'Bearer', refreshToken: 'new-refresh' };
      oauthService.refreshToken.mockResolvedValue(refreshedToken);
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.applyAuth(
        {
          type: 'oauth2',
          oauthToken: 'stale-token',
          oauthTokenData: { accessToken: 'stale-token', tokenType: 'Bearer', refreshToken: 'old-refresh', expiresAt: 1000 },
          oauth2: { grantType: 'authorization_code', tokenUrl: 'https://auth.example.com/token', clientId: 'client-id', clientSecret: 'client-secret' },
        },
        {}, {}, defaultConfig
      );

      expect(oauthService.isTokenExpired).toHaveBeenCalledWith(
        expect.objectContaining({ accessToken: 'stale-token', refreshToken: 'old-refresh' })
      );
      expect(oauthService.refreshToken).toHaveBeenCalledWith(
        'https://auth.example.com/token', 'client-id', 'client-secret', 'old-refresh'
      );
      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer refreshed-token' });
      expect(result.tokenRefreshed).toEqual(refreshedToken);
      expect(result.warning).toBeUndefined();
    });

    it('falls back to stale token with warning when refresh fails', async () => {
      const oauthService = createMockOAuthService();
      oauthService.isTokenExpired.mockReturnValue(true);
      oauthService.refreshToken.mockRejectedValue(new Error('Network error'));
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.applyAuth(
        {
          type: 'oauth2',
          oauthToken: 'stale-token',
          oauthTokenData: { accessToken: 'stale-token', tokenType: 'Bearer', refreshToken: 'old-refresh', expiresAt: 1000 },
          oauth2: { grantType: 'authorization_code', tokenUrl: 'https://auth.example.com/token', clientId: 'cid' },
        },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer stale-token' });
      expect(result.tokenRefreshed).toBeUndefined();
      expect(result.warning).toBe('OAuth2 token refresh failed: Network error. Using stale token.');
    });

    it('does not refresh when token is not expired', async () => {
      const oauthService = createMockOAuthService();
      oauthService.isTokenExpired.mockReturnValue(false);
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.applyAuth(
        {
          type: 'oauth2',
          oauthToken: 'valid-token',
          oauthTokenData: { accessToken: 'valid-token', tokenType: 'Bearer', refreshToken: 'refresh', expiresAt: Date.now() + 3600000 },
          oauth2: { grantType: 'authorization_code', tokenUrl: 'https://auth.example.com/token', clientId: 'cid' },
        },
        {}, {}, defaultConfig
      );

      expect(oauthService.refreshToken).not.toHaveBeenCalled();
      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer valid-token' });
    });

    it('does not refresh when refreshToken is missing from token data', async () => {
      const oauthService = createMockOAuthService();
      oauthService.isTokenExpired.mockReturnValue(true);
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.applyAuth(
        {
          type: 'oauth2',
          oauthToken: 'stale-token',
          oauthTokenData: { accessToken: 'stale-token', tokenType: 'Bearer', expiresAt: 1000 },
          oauth2: { grantType: 'authorization_code', tokenUrl: 'https://auth.example.com/token', clientId: 'cid' },
        },
        {}, {}, defaultConfig
      );

      expect(oauthService.refreshToken).not.toHaveBeenCalled();
      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer stale-token' });
    });

    it('does not refresh when tokenUrl is missing from oauth2 config', async () => {
      const oauthService = createMockOAuthService();
      oauthService.isTokenExpired.mockReturnValue(true);
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.applyAuth(
        {
          type: 'oauth2',
          oauthToken: 'stale-token',
          oauthTokenData: { accessToken: 'stale-token', tokenType: 'Bearer', refreshToken: 'refresh', expiresAt: 1000 },
          oauth2: { grantType: 'authorization_code', clientId: 'cid' },
        },
        {}, {}, defaultConfig
      );

      expect(oauthService.refreshToken).not.toHaveBeenCalled();
      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer stale-token' });
    });

    it('does not refresh when oauth2 config is undefined', async () => {
      const oauthService = createMockOAuthService();
      oauthService.isTokenExpired.mockReturnValue(true);
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.applyAuth(
        {
          type: 'oauth2',
          oauthToken: 'stale-token',
          oauthTokenData: { accessToken: 'stale-token', tokenType: 'Bearer', refreshToken: 'refresh', expiresAt: 1000 },
        },
        {}, {}, defaultConfig
      );

      expect(oauthService.refreshToken).not.toHaveBeenCalled();
      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer stale-token' });
    });

    it('does not attempt refresh when oauthTokenData is undefined', async () => {
      const oauthService = createMockOAuthService();
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.applyAuth(
        {
          type: 'oauth2',
          oauthToken: 'my-token',
          oauth2: { grantType: 'authorization_code', tokenUrl: 'https://auth.example.com/token', clientId: 'cid' },
        },
        {}, {}, defaultConfig
      );

      expect(oauthService.isTokenExpired).not.toHaveBeenCalled();
      expect(oauthService.refreshToken).not.toHaveBeenCalled();
      expect(result.headerUpdates).toEqual({ Authorization: 'Bearer my-token' });
    });

    // --- Unknown auth type ---

    it('returns empty result for unknown auth type', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'unknown-type' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({});
      expect(result.paramUpdates).toEqual({});
      expect(result.authConfig).toBeUndefined();
    });

    it('returns empty result for auth with type "none"', async () => {
      const { handler } = createHandler();
      const result = await handler.applyAuth(
        { type: 'none' },
        {}, {}, defaultConfig
      );

      expect(result.headerUpdates).toEqual({});
      expect(result.paramUpdates).toEqual({});
    });
  });

  // --- startOAuthFlow tests ---

  describe('startOAuthFlow', () => {
    it('calls clientCredentialsFlow for client_credentials grant type', async () => {
      const oauthService = createMockOAuthService();
      const token = { accessToken: 'cc-token', tokenType: 'Bearer' };
      oauthService.clientCredentialsFlow.mockResolvedValue(token);
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'client_credentials', tokenUrl: 'https://auth.example.com/token', clientId: 'cid' } as any,
        onToken, onError, openExternal
      );

      expect(oauthService.clientCredentialsFlow).toHaveBeenCalledTimes(1);
      expect(onToken).toHaveBeenCalledWith(token);
      expect(onError).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
    });

    it('calls passwordFlow for password grant type', async () => {
      const oauthService = createMockOAuthService();
      const token = { accessToken: 'pw-token', tokenType: 'Bearer' };
      oauthService.passwordFlow.mockResolvedValue(token);
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'password', tokenUrl: 'https://auth.example.com/token', clientId: 'cid', username: 'u', password: 'p' } as any,
        onToken, onError, openExternal
      );

      expect(oauthService.passwordFlow).toHaveBeenCalledTimes(1);
      expect(onToken).toHaveBeenCalledWith(token);
      expect(onError).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
    });

    it('starts authorization code flow and calls openExternal with auth URL', async () => {
      const oauthService = createMockOAuthService();
      oauthService.startAuthorizationCodeFlow.mockResolvedValue('https://auth.example.com/authorize?client_id=cid');
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'authorization_code', authUrl: 'https://auth.example.com/authorize', tokenUrl: 'https://auth.example.com/token', clientId: 'cid' } as any,
        onToken, onError, openExternal
      );

      expect(oauthService.startAuthorizationCodeFlow).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledWith('https://auth.example.com/authorize?client_id=cid');
      expect(onToken).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('passes onToken and onError callbacks to startAuthorizationCodeFlow', async () => {
      const oauthService = createMockOAuthService();
      oauthService.startAuthorizationCodeFlow.mockResolvedValue('https://auth.example.com/authorize');
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'authorization_code', clientId: 'cid' } as any,
        onToken, onError, openExternal
      );

      const callArgs = oauthService.startAuthorizationCodeFlow.mock.calls[0];
      // Second argument: wraps onToken callback
      const tokenCallback = callArgs[1];
      const errorCallback = callArgs[2];
      const testToken = { accessToken: 'test', tokenType: 'Bearer' };
      tokenCallback(testToken);
      expect(onToken).toHaveBeenCalledWith(testToken);

      errorCallback('some error');
      expect(onError).toHaveBeenCalledWith('some error');
    });

    it('defaults to authorization code flow for unrecognized grant types', async () => {
      const oauthService = createMockOAuthService();
      oauthService.startAuthorizationCodeFlow.mockResolvedValue('https://auth.example.com/authorize');
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'implicit', clientId: 'cid' } as any,
        onToken, onError, openExternal
      );

      expect(oauthService.startAuthorizationCodeFlow).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalled();
    });

    it('calls onError when clientCredentialsFlow throws', async () => {
      const oauthService = createMockOAuthService();
      oauthService.clientCredentialsFlow.mockRejectedValue(new Error('Token URL is required'));
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'client_credentials', clientId: 'cid' } as any,
        onToken, onError, openExternal
      );

      expect(onError).toHaveBeenCalledWith('Token URL is required');
      expect(onToken).not.toHaveBeenCalled();
    });

    it('calls onError when passwordFlow throws', async () => {
      const oauthService = createMockOAuthService();
      oauthService.passwordFlow.mockRejectedValue(new Error('Username and password are required'));
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'password', clientId: 'cid' } as any,
        onToken, onError, openExternal
      );

      expect(onError).toHaveBeenCalledWith('Username and password are required');
      expect(onToken).not.toHaveBeenCalled();
    });

    it('calls onError when startAuthorizationCodeFlow throws', async () => {
      const oauthService = createMockOAuthService();
      oauthService.startAuthorizationCodeFlow.mockRejectedValue(new Error('Port already in use'));
      const { handler } = createHandler({ oauth: oauthService });

      const onToken = jest.fn();
      const onError = jest.fn();
      const openExternal = jest.fn();

      await handler.startOAuthFlow(
        { grantType: 'authorization_code', clientId: 'cid' } as any,
        onToken, onError, openExternal
      );

      expect(onError).toHaveBeenCalledWith('Port already in use');
      expect(onToken).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
    });

    it('passes the full config to clientCredentialsFlow', async () => {
      const oauthService = createMockOAuthService();
      oauthService.clientCredentialsFlow.mockResolvedValue({ accessToken: 'tok', tokenType: 'Bearer' });
      const { handler } = createHandler({ oauth: oauthService });

      const config = { grantType: 'client_credentials', tokenUrl: 'https://auth.example.com/token', clientId: 'cid', clientSecret: 'cs', scope: 'read' } as any;
      await handler.startOAuthFlow(config, jest.fn(), jest.fn(), jest.fn());

      expect(oauthService.clientCredentialsFlow).toHaveBeenCalledWith(config);
    });

    it('passes the full config to passwordFlow', async () => {
      const oauthService = createMockOAuthService();
      oauthService.passwordFlow.mockResolvedValue({ accessToken: 'tok', tokenType: 'Bearer' });
      const { handler } = createHandler({ oauth: oauthService });

      const config = { grantType: 'password', tokenUrl: 'https://auth.example.com/token', clientId: 'cid', username: 'u', password: 'p' } as any;
      await handler.startOAuthFlow(config, jest.fn(), jest.fn(), jest.fn());

      expect(oauthService.passwordFlow).toHaveBeenCalledWith(config);
    });
  });

  // --- refreshOAuthToken tests ---

  describe('refreshOAuthToken', () => {
    it('delegates to oauthService.refreshToken with correct args', async () => {
      const oauthService = createMockOAuthService();
      const refreshedToken = { accessToken: 'new-token', tokenType: 'Bearer', refreshToken: 'new-refresh' };
      oauthService.refreshToken.mockResolvedValue(refreshedToken);
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.refreshOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'my-client',
        clientSecret: 'my-secret',
        refreshToken: 'old-refresh',
      });

      expect(oauthService.refreshToken).toHaveBeenCalledWith(
        'https://auth.example.com/token', 'my-client', 'my-secret', 'old-refresh'
      );
      expect(result).toEqual(refreshedToken);
    });

    it('passes undefined clientSecret when not provided', async () => {
      const oauthService = createMockOAuthService();
      oauthService.refreshToken.mockResolvedValue({ accessToken: 'tok', tokenType: 'Bearer' });
      const { handler } = createHandler({ oauth: oauthService });

      await handler.refreshOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'cid',
        refreshToken: 'rt',
      } as any);

      expect(oauthService.refreshToken).toHaveBeenCalledWith(
        'https://auth.example.com/token', 'cid', undefined, 'rt'
      );
    });

    it('propagates errors from oauthService.refreshToken', async () => {
      const oauthService = createMockOAuthService();
      oauthService.refreshToken.mockRejectedValue(new Error('Invalid refresh token'));
      const { handler } = createHandler({ oauth: oauthService });

      await expect(
        handler.refreshOAuthToken({
          tokenUrl: 'https://auth.example.com/token',
          clientId: 'cid',
          clientSecret: 'cs',
          refreshToken: 'bad-token',
        })
      ).rejects.toThrow('Invalid refresh token');
    });

    it('returns the token object from oauthService', async () => {
      const oauthService = createMockOAuthService();
      const expectedToken = { accessToken: 'at', tokenType: 'Bearer', refreshToken: 'rt', expiresAt: 99999, scope: 'read write' };
      oauthService.refreshToken.mockResolvedValue(expectedToken);
      const { handler } = createHandler({ oauth: oauthService });

      const result = await handler.refreshOAuthToken({
        tokenUrl: 'https://auth.example.com/token',
        clientId: 'cid',
        clientSecret: 'cs',
        refreshToken: 'rt',
      });

      expect(result).toBe(expectedToken);
    });
  });

  // --- executeNtlmRequest tests ---

  describe('executeNtlmRequest', () => {
    beforeEach(() => {
      mockHttpntlm.get.mockReset();
      mockHttpntlm.post.mockReset();
      mockHttpntlm.put.mockReset();
      mockHttpntlm.delete.mockReset();
    });

    it('calls the correct httpntlm method based on request method', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: 'hello',
      };

      mockHttpntlm.post.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        method: 'POST',
        url: 'https://intranet.corp.com/api',
        headers: { 'Content-Type': 'application/json' },
        data: '{"key":"value"}',
        _ntlmAuth: { username: 'user', password: 'pass', domain: 'CORP', workstation: '' },
      });

      expect(mockHttpntlm.post).toHaveBeenCalled();
      const opts = mockHttpntlm.post.mock.calls[0][0];
      expect(opts.url).toBe('https://intranet.corp.com/api');
      expect(opts.username).toBe('user');
      expect(opts.password).toBe('pass');
      expect(opts.domain).toBe('CORP');
      expect(opts.body).toBe('{"key":"value"}');
      expect(result.status).toBe(200);
      expect(result.statusText).toBe('OK');
      expect(result.data).toBe('hello');
      expect(result.httpVersion).toBe('1.1');
      expect(result.timing.total).toBeGreaterThanOrEqual(0);
      expect(result.timeline).toEqual([]);

    });

    it('defaults to GET when method is not specified', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(mockHttpntlm.get).toHaveBeenCalled();

    });

    it('falls back to httpntlm.get for unknown methods', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        method: 'PATCH',
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      // PATCH is not a standard httpntlm method, so it falls back to get
      expect(mockHttpntlm.get).toHaveBeenCalled();

    });

    it('sets rejectUnauthorized to false when ssl option specifies it', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest(
        {
          url: 'https://intranet.corp.com/api',
          _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
        },
        { rejectUnauthorized: false }
      );

      const opts = mockHttpntlm.get.mock.calls[0][0];
      expect(opts.rejectUnauthorized).toBe(false);

    });

    it('does not set rejectUnauthorized when ssl is undefined', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      const opts = mockHttpntlm.get.mock.calls[0][0];
      expect(opts.rejectUnauthorized).toBeUndefined();

    });

    it('serializes object data to JSON string for body', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.post.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        method: 'POST',
        url: 'https://intranet.corp.com/api',
        data: { foo: 'bar' },
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      const opts = mockHttpntlm.post.mock.calls[0][0];
      expect(opts.body).toBe('{"foo":"bar"}');

    });

    it('passes string data directly as body', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.post.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        method: 'POST',
        url: 'https://intranet.corp.com/api',
        data: 'raw-string-body',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      const opts = mockHttpntlm.post.mock.calls[0][0];
      expect(opts.body).toBe('raw-string-body');

    });

    it('does not set body when data is undefined', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      const opts = mockHttpntlm.get.mock.calls[0][0];
      expect(opts.body).toBeUndefined();

    });

    it('parses JSON response body when content-type is application/json', async () => {
      const { handler } = createHandler();
      const jsonBody = '{"message":"success"}';
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: jsonBody,
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(result.data).toEqual({ message: 'success' });

    });

    it('returns raw body when JSON parsing fails', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json' },
        body: 'not-valid-json',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(result.data).toBe('not-valid-json');

    });

    it('does not parse body for non-JSON content types', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'text/html' },
        body: '{"this":"is-html"}',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      // Should remain as raw string since content-type is text/html
      expect(result.data).toBe('{"this":"is-html"}');

    });

    it('flattens array header values to comma-separated string', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {
          'set-cookie': ['cookie1=a', 'cookie2=b'],
          'content-type': 'text/html',
        },
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(result.headers['set-cookie']).toBe('cookie1=a, cookie2=b');
      expect(result.headers['content-type']).toBe('text/html');

    });

    it('handles null/undefined header values by converting to empty string', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: { 'x-custom': null },
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(result.headers['x-custom']).toBe('');

    });

    it('rejects when httpntlm returns an error', async () => {
      const { handler } = createHandler();

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(new Error('NTLM auth failed')));

      await expect(
        handler.executeNtlmRequest({
          url: 'https://intranet.corp.com/api',
          _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
        })
      ).rejects.toThrow('NTLM auth failed');

    });

    it('defaults statusMessage to empty string when missing', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 204,
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(result.status).toBe(204);
      expect(result.statusText).toBe('');

    });

    it('returns correct timing data structure', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(result.timing).toEqual(expect.objectContaining({
        dnsLookup: 0,
        tcpConnection: 0,
        tlsHandshake: 0,
        contentTransfer: 0,
      }));
      expect(result.timing.ttfb).toBeGreaterThanOrEqual(0);
      expect(result.timing.total).toBe(result.timing.ttfb);

    });

    it('handles missing headers in NTLM response', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        body: 'data',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(result.headers).toEqual({});
      expect(result.data).toBe('data');

    });

    it('uses PUT method when specified', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.put.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        method: 'PUT',
        url: 'https://intranet.corp.com/api',
        data: 'update-data',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(mockHttpntlm.put).toHaveBeenCalled();

    });

    it('uses DELETE method when specified', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 204,
        statusMessage: 'No Content',
        headers: {},
        body: '',
      };

      mockHttpntlm.delete.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const result = await handler.executeNtlmRequest({
        method: 'DELETE',
        url: 'https://intranet.corp.com/api/item/1',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      expect(mockHttpntlm.delete).toHaveBeenCalled();
      expect(result.status).toBe(204);

    });

    it('passes headers through to httpntlm options', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      const requestHeaders = { 'Accept': 'application/json', 'X-Custom': 'value' };
      await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        headers: requestHeaders,
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      const opts = mockHttpntlm.get.mock.calls[0][0];
      expect(opts.headers).toEqual(requestHeaders);

    });

    it('defaults headers to empty object when not provided', async () => {
      const { handler } = createHandler();
      const ntlmResponse = {
        statusCode: 200,
        statusMessage: 'OK',
        headers: {},
        body: '',
      };

      mockHttpntlm.get.mockImplementation((_opts: any, cb: any) => cb(null, ntlmResponse));

      await handler.executeNtlmRequest({
        url: 'https://intranet.corp.com/api',
        _ntlmAuth: { username: 'user', password: 'pass', domain: '', workstation: '' },
      });

      const opts = mockHttpntlm.get.mock.calls[0][0];
      expect(opts.headers).toEqual({});

    });
  });
});
