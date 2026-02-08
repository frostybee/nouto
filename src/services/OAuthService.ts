import * as http from 'http';
import * as https from 'https';
import * as crypto from 'crypto';
import { URL, URLSearchParams } from 'url';
import type { OAuth2Config, OAuthToken } from './types';

export class OAuthService {
  private callbackServer: http.Server | null = null;

  /**
   * Start an OAuth 2.0 Authorization Code flow
   * Returns the callback URL for the webview to open
   */
  async startAuthorizationCodeFlow(
    config: OAuth2Config,
    onToken: (token: OAuthToken) => void,
    onError: (error: string) => void
  ): Promise<string> {
    const { codeVerifier, codeChallenge } = config.usePkce
      ? this.generatePkce()
      : { codeVerifier: undefined, codeChallenge: undefined };

    return new Promise((resolve, reject) => {
      this.callbackServer = http.createServer(async (req, res) => {
        try {
          const reqUrl = new URL(req.url || '', `http://localhost`);

          if (reqUrl.pathname === '/callback') {
            const code = reqUrl.searchParams.get('code');
            const error = reqUrl.searchParams.get('error');

            if (error) {
              const desc = reqUrl.searchParams.get('error_description') || error;
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(this.getResultHtml(false, desc));
              onError(desc);
              this.closeServer();
              return;
            }

            if (!code) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(this.getResultHtml(false, 'No authorization code received'));
              onError('No authorization code received');
              this.closeServer();
              return;
            }

            // Exchange code for token
            try {
              const callbackUrl = `http://localhost:${(this.callbackServer!.address() as any).port}/callback`;
              const token = await this.exchangeCodeForToken(config, code, callbackUrl, codeVerifier);
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(this.getResultHtml(true, 'Authorization successful! You can close this tab.'));
              onToken(token);
            } catch (err: any) {
              res.writeHead(200, { 'Content-Type': 'text/html' });
              res.end(this.getResultHtml(false, err.message));
              onError(err.message);
            }
            this.closeServer();
          } else if (reqUrl.pathname === '/implicit-callback') {
            // Serve HTML page that reads the fragment and posts back
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(this.getImplicitCallbackHtml());
          } else if (reqUrl.pathname === '/implicit-token') {
            // Receive token from implicit flow page
            let body = '';
            req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
            req.on('end', () => {
              try {
                const params = new URLSearchParams(body);
                const accessToken = params.get('access_token');
                if (!accessToken) {
                  throw new Error('No access token in response');
                }
                const token: OAuthToken = {
                  accessToken,
                  tokenType: params.get('token_type') || 'Bearer',
                  scope: params.get('scope') || undefined,
                  expiresAt: params.get('expires_in')
                    ? Date.now() + parseInt(params.get('expires_in')!) * 1000
                    : undefined,
                };
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(this.getResultHtml(true, 'Authorization successful!'));
                onToken(token);
              } catch (err: any) {
                res.writeHead(200);
                res.end('Error');
                onError(err.message);
              }
              this.closeServer();
            });
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        } catch (err: any) {
          res.writeHead(500);
          res.end('Internal Error');
          onError(err.message);
          this.closeServer();
        }
      });

      this.callbackServer.listen(0, '127.0.0.1', () => {
        const port = (this.callbackServer!.address() as any).port;
        const isImplicit = config.grantType === 'implicit';
        const callbackPath = isImplicit ? '/implicit-callback' : '/callback';
        const callbackUrl = `http://localhost:${port}${callbackPath}`;

        // Build authorization URL
        const authParams = new URLSearchParams({
          client_id: config.clientId,
          redirect_uri: callbackUrl,
          response_type: isImplicit ? 'token' : 'code',
        });

        if (config.scope) authParams.set('scope', config.scope);
        if (config.state) authParams.set('state', config.state);
        if (codeChallenge) {
          authParams.set('code_challenge', codeChallenge);
          authParams.set('code_challenge_method', 'S256');
        }

        const authUrl = `${config.authUrl}?${authParams.toString()}`;
        resolve(authUrl);
      });

      this.callbackServer.on('error', (err) => {
        reject(err);
      });

      // Auto-close after 5 minutes
      setTimeout(() => {
        if (this.callbackServer) {
          onError('OAuth flow timed out');
          this.closeServer();
        }
      }, 5 * 60 * 1000);
    });
  }

  /**
   * Client Credentials flow — no browser required
   */
  async clientCredentialsFlow(config: OAuth2Config): Promise<OAuthToken> {
    if (!config.tokenUrl) throw new Error('Token URL is required');

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.clientId,
    });
    if (config.clientSecret) params.set('client_secret', config.clientSecret);
    if (config.scope) params.set('scope', config.scope);

    return this.requestToken(config.tokenUrl, params);
  }

  /**
   * Password (Resource Owner) flow
   */
  async passwordFlow(config: OAuth2Config): Promise<OAuthToken> {
    if (!config.tokenUrl) throw new Error('Token URL is required');
    if (!config.username || !config.password) throw new Error('Username and password are required');

    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: config.clientId,
      username: config.username,
      password: config.password,
    });
    if (config.clientSecret) params.set('client_secret', config.clientSecret);
    if (config.scope) params.set('scope', config.scope);

    return this.requestToken(config.tokenUrl, params);
  }

  /**
   * Refresh an access token
   */
  async refreshToken(tokenUrl: string, clientId: string, clientSecret: string | undefined, refreshToken: string): Promise<OAuthToken> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      refresh_token: refreshToken,
    });
    if (clientSecret) params.set('client_secret', clientSecret);

    return this.requestToken(tokenUrl, params);
  }

  /**
   * Check if a token needs refresh (expired or within 30s buffer)
   */
  isTokenExpired(token: OAuthToken): boolean {
    if (!token.expiresAt) return false;
    return Date.now() >= token.expiresAt - 30_000;
  }

  /**
   * Generate a token key from config for storage
   */
  getTokenKey(config: OAuth2Config): string {
    const input = `${config.clientId}:${config.authUrl || config.tokenUrl || ''}`;
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
  }

  dispose(): void {
    this.closeServer();
  }

  // ---- Private helpers ----

  private async exchangeCodeForToken(
    config: OAuth2Config,
    code: string,
    callbackUrl: string,
    codeVerifier?: string
  ): Promise<OAuthToken> {
    if (!config.tokenUrl) throw new Error('Token URL is required');

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
      client_id: config.clientId,
    });
    if (config.clientSecret) params.set('client_secret', config.clientSecret);
    if (codeVerifier) params.set('code_verifier', codeVerifier);

    return this.requestToken(config.tokenUrl, params);
  }

  private requestToken(tokenUrl: string, params: URLSearchParams): Promise<OAuthToken> {
    return new Promise((resolve, reject) => {
      const url = new URL(tokenUrl);
      const body = params.toString();
      const isHttps = url.protocol === 'https:';
      const requestFn = isHttps ? https.request : http.request;

      const req = requestFn(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
            'Accept': 'application/json',
          },
        },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.error) {
                reject(new Error(json.error_description || json.error));
                return;
              }
              const token: OAuthToken = {
                accessToken: json.access_token,
                refreshToken: json.refresh_token,
                tokenType: json.token_type || 'Bearer',
                scope: json.scope,
                expiresAt: json.expires_in
                  ? Date.now() + json.expires_in * 1000
                  : undefined,
              };
              resolve(token);
            } catch {
              reject(new Error(`Invalid token response: ${data.substring(0, 200)}`));
            }
          });
        }
      );

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private generatePkce(): { codeVerifier: string; codeChallenge: string } {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    return { codeVerifier, codeChallenge };
  }

  private closeServer(): void {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
    }
  }

  private getResultHtml(success: boolean, message: string): string {
    const color = success ? '#49cc90' : '#f93e3e';
    const icon = success ? '\u2713' : '\u2717';
    return `<!DOCTYPE html>
<html><head><style>
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#ccc}
.box{text-align:center;padding:40px}
.icon{font-size:48px;color:${color}}
</style></head><body>
<div class="box"><div class="icon">${icon}</div><p>${message}</p></div>
</body></html>`;
  }

  private getImplicitCallbackHtml(): string {
    return `<!DOCTYPE html>
<html><head><script>
(function(){
  var hash = window.location.hash.substring(1);
  if(!hash){document.body.innerText='No token received';return;}
  fetch('/implicit-token',{method:'POST',body:hash,headers:{'Content-Type':'application/x-www-form-urlencoded'}})
    .then(function(){document.body.innerText='Authorization successful! You can close this tab.';})
    .catch(function(){document.body.innerText='Error sending token';});
})();
</script></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#1e1e1e;color:#ccc">
Processing...
</body></html>`;
  }
}
