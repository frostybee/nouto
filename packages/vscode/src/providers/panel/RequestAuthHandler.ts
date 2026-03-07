import type { OAuthService, AwsSignatureService } from '@hivefetch/core/services';
import type { OAuth2Config, OAuthToken } from '../../services/types';

export interface AuthApplyResult {
  headerUpdates: Record<string, string>;
  paramUpdates: Record<string, string>;
  authConfig?: { username: string; password: string };
  ntlmAuth?: { username: string; password: string; domain: string; workstation: string };
  digestAuth?: { username: string; password: string };
  tokenRefreshed?: OAuthToken;
  warning?: string;
}

export class RequestAuthHandler {
  constructor(
    private readonly oauthService: OAuthService,
    private readonly awsSignatureService: AwsSignatureService
  ) {}

  async applyAuth(
    auth: any,
    headers: Record<string, string>,
    params: Record<string, string>,
    config: { method: string; url: string; data?: any }
  ): Promise<AuthApplyResult> {
    const headerUpdates: Record<string, string> = {};
    const paramUpdates: Record<string, string> = {};
    const result: AuthApplyResult = { headerUpdates, paramUpdates };

    if (!auth) return result;

    if (auth.type === 'oauth2') {
      let oauthToken: string | undefined = auth.oauthToken;
      const oauthTokenData: OAuthToken | undefined = auth.oauthTokenData;
      const oauth2Config: OAuth2Config | undefined = auth.oauth2;

      if (oauthTokenData && this.oauthService.isTokenExpired(oauthTokenData) && oauthTokenData.refreshToken && oauth2Config?.tokenUrl) {
        try {
          const refreshed = await this.oauthService.refreshToken(
            oauth2Config.tokenUrl,
            oauth2Config.clientId,
            oauth2Config.clientSecret,
            oauthTokenData.refreshToken
          );
          oauthToken = refreshed.accessToken;
          result.tokenRefreshed = refreshed;
        } catch (err: any) {
          result.warning = `OAuth2 token refresh failed: ${err.message}. Using stale token.`;
        }
      }

      if (oauthToken) {
        headerUpdates['Authorization'] = `Bearer ${oauthToken}`;
      }
    } else if (auth.type === 'bearer' && auth.token) {
      headerUpdates['Authorization'] = `Bearer ${auth.token}`;
    } else if (auth.type === 'basic' && auth.username) {
      result.authConfig = {
        username: auth.username,
        password: auth.password || '',
      };
    } else if (auth.type === 'apikey' && auth.apiKeyName && auth.apiKeyValue) {
      if (auth.apiKeyIn === 'query') {
        paramUpdates[auth.apiKeyName] = auth.apiKeyValue;
      } else {
        headerUpdates[auth.apiKeyName] = auth.apiKeyValue;
      }
    } else if (auth.type === 'aws' && auth.awsAccessKey && auth.awsSecretKey) {
      const bodyStr = typeof config.data === 'string' ? config.data
        : config.data ? JSON.stringify(config.data) : '';
      const awsHeaders = this.awsSignatureService.sign(
        { method: config.method, url: config.url, headers: { ...headers }, body: bodyStr },
        {
          accessKey: auth.awsAccessKey,
          secretKey: auth.awsSecretKey,
          region: auth.awsRegion || 'us-east-1',
          service: auth.awsService || 's3',
          sessionToken: auth.awsSessionToken || undefined,
        }
      );
      Object.assign(headerUpdates, awsHeaders);
    } else if (auth.type === 'ntlm' && auth.username) {
      result.ntlmAuth = {
        username: auth.username,
        password: auth.password || '',
        domain: auth.ntlmDomain || '',
        workstation: auth.ntlmWorkstation || '',
      };
    } else if (auth.type === 'digest' && auth.username) {
      result.digestAuth = {
        username: auth.username,
        password: auth.password || '',
      };
    }

    return result;
  }

  async startOAuthFlow(
    config: OAuth2Config,
    onToken: (token: OAuthToken) => void,
    onError: (message: string) => void,
    openExternal: (url: string) => void
  ): Promise<void> {
    try {
      if (config.grantType === 'client_credentials') {
        const token = await this.oauthService.clientCredentialsFlow(config);
        onToken(token);
      } else if (config.grantType === 'password') {
        const token = await this.oauthService.passwordFlow(config);
        onToken(token);
      } else {
        const authUrl = await this.oauthService.startAuthorizationCodeFlow(
          config,
          (token) => onToken(token),
          (error) => onError(error)
        );
        openExternal(authUrl);
      }
    } catch (error: any) {
      onError(error.message);
    }
  }

  async refreshOAuthToken(data: {
    tokenUrl: string; clientId: string; clientSecret?: string; refreshToken: string;
  }): Promise<OAuthToken> {
    return this.oauthService.refreshToken(data.tokenUrl, data.clientId, data.clientSecret, data.refreshToken);
  }

  async executeNtlmRequest(
    config: any,
    ssl?: { rejectUnauthorized?: boolean }
  ): Promise<{
    status: number; statusText: string; headers: Record<string, string>; data: any;
    httpVersion: string; remoteAddress?: string; timing: import('@hivefetch/core').TimingData;
    timeline: import('@hivefetch/core').TimelineEvent[];
  }> {
    const httpntlm = require('httpntlm');
    const { method = 'GET', url, headers = {}, data, _ntlmAuth } = config;
    const ntlmOpts: any = {
      url,
      username: _ntlmAuth.username,
      password: _ntlmAuth.password,
      workstation: _ntlmAuth.workstation || '',
      domain: _ntlmAuth.domain || '',
      headers,
    };
    if (ssl?.rejectUnauthorized === false) {
      ntlmOpts.rejectUnauthorized = false;
    }
    if (data !== undefined) {
      ntlmOpts.body = typeof data === 'string' ? data : JSON.stringify(data);
    }

    const start = Date.now();
    const res = await new Promise<any>((resolve, reject) => {
      const fn = httpntlm[method.toLowerCase()] || httpntlm.get;
      fn(ntlmOpts, (err: any, res: any) => {
        if (err) reject(err);
        else resolve(res);
      });
    });
    const duration = Date.now() - start;

    const flatHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(res.headers || {})) {
      flatHeaders[k] = Array.isArray(v) ? (v as string[]).join(', ') : String(v ?? '');
    }

    let parsedData: any = res.body;
    try {
      const ct = flatHeaders['content-type'] || '';
      if (ct.includes('application/json')) {
        parsedData = JSON.parse(res.body);
      }
    } catch { /* use raw body */ }

    const emptyTiming = { dnsLookup: 0, tcpConnection: 0, tlsHandshake: 0, ttfb: duration, contentTransfer: 0, total: duration };
    return {
      status: res.statusCode,
      statusText: res.statusMessage || '',
      headers: flatHeaders,
      data: parsedData,
      httpVersion: '1.1',
      timing: emptyTiming,
      timeline: [],
    };
  }
}
