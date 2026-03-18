import * as crypto from 'crypto';
import { URL } from 'url';

export interface AwsSignatureConfig {
  accessKey: string;
  secretKey: string;
  region: string;
  service: string;
  sessionToken?: string;
}

export interface SignableRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string | Buffer;
}

/**
 * AWS Signature Version 4 signing implementation.
 * Signs HTTP requests for AWS services (S3, API Gateway, Lambda, etc.).
 */
export class AwsSignatureService {

  /**
   * Sign a request with AWS Signature V4.
   * Adds Authorization, x-amz-date, x-amz-content-sha256, and optionally x-amz-security-token headers.
   */
  sign(request: SignableRequest, config: AwsSignatureConfig): Record<string, string> {
    const { accessKey, secretKey, region, service, sessionToken } = config;
    if (!accessKey || !secretKey || !region || !service) {
      return {};
    }

    const parsedUrl = new URL(request.url);
    const now = new Date();
    const dateStamp = this.toDateStamp(now);
    const amzDate = this.toAmzDate(now);

    // Compute payload hash
    const payloadHash = this.hash(request.body || '');

    // Build headers to sign
    const headers: Record<string, string> = { ...request.headers };
    headers['host'] = parsedUrl.host;
    headers['x-amz-date'] = amzDate;
    headers['x-amz-content-sha256'] = payloadHash;
    if (sessionToken) {
      headers['x-amz-security-token'] = sessionToken;
    }

    // Canonical request
    const canonicalHeaders = this.buildCanonicalHeaders(headers);
    const signedHeaders = this.buildSignedHeaders(headers);
    const canonicalQueryString = this.buildCanonicalQueryString(parsedUrl);
    const canonicalUri = this.encodeUri(parsedUrl.pathname || '/');

    const canonicalRequest = [
      request.method.toUpperCase(),
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      '',
      signedHeaders,
      payloadHash,
    ].join('\n');

    // String to sign
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      this.hash(canonicalRequest),
    ].join('\n');

    // Signing key
    const signingKey = this.getSigningKey(secretKey, dateStamp, region, service);
    const signature = this.hmac(signingKey, stringToSign).toString('hex');

    // Authorization header
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const result: Record<string, string> = {
      'Authorization': authorization,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
    };

    if (sessionToken) {
      result['x-amz-security-token'] = sessionToken;
    }

    return result;
  }

  private toDateStamp(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').substring(0, 8);
  }

  private toAmzDate(date: Date): string {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  }

  private hash(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private hmac(key: string | Buffer, data: string): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  private getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = this.hmac(`AWS4${secretKey}`, dateStamp);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    return this.hmac(kService, 'aws4_request');
  }

  private buildCanonicalHeaders(headers: Record<string, string>): string {
    const normalized = new Map<string, string>();
    for (const [k, v] of Object.entries(headers)) {
      normalized.set(k.toLowerCase(), v.trim().replace(/\s+/g, ' '));
    }
    return Array.from(normalized.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join('\n');
  }

  private buildSignedHeaders(headers: Record<string, string>): string {
    const keys = new Set(Object.keys(headers).map(k => k.toLowerCase()));
    return Array.from(keys).sort().join(';');
  }

  private buildCanonicalQueryString(url: URL): string {
    const params = Array.from(url.searchParams.entries());
    if (params.length === 0) return '';
    return params
      .sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))
      .map(([k, v]) => `${this.uriEncode(k)}=${this.uriEncode(v)}`)
      .join('&');
  }

  private uriEncode(str: string): string {
    return encodeURIComponent(str).replace(/%20/g, '%20');
  }

  private encodeUri(path: string): string {
    return path
      .split('/')
      .map(segment => this.uriEncode(segment))
      .join('/');
  }
}
