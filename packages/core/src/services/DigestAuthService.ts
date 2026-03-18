import * as crypto from 'crypto';

export interface DigestChallenge {
  realm: string;
  nonce: string;
  qop?: string;
  opaque?: string;
  algorithm?: string;
  stale?: boolean;
}

export interface DigestParams {
  username: string;
  password: string;
  method: string;
  uri: string;
  challenge: DigestChallenge;
}

/**
 * Parse the WWW-Authenticate header to extract digest challenge parameters.
 */
export function parseDigestChallenge(wwwAuthenticate: string): DigestChallenge | null {
  const digestPrefix = /^Digest\s+/i;
  if (!digestPrefix.test(wwwAuthenticate)) return null;

  const paramString = wwwAuthenticate.replace(digestPrefix, '');
  const params: Record<string, string> = {};

  // Parse key="value" and key=value pairs
  const regex = /(\w+)=(?:"([^"]*)"|([\w-]+))/g;
  let match;
  while ((match = regex.exec(paramString)) !== null) {
    params[match[1].toLowerCase()] = match[2] ?? match[3];
  }

  if (!params['realm'] || !params['nonce']) return null;

  return {
    realm: params['realm'],
    nonce: params['nonce'],
    qop: params['qop'],
    opaque: params['opaque'],
    algorithm: params['algorithm'],
    stale: params['stale']?.toLowerCase() === 'true',
  };
}

/**
 * Compute the Digest Authorization header value per RFC 7616.
 *
 * Supports:
 * - algorithm: MD5 (default), SHA-256, MD5-sess, SHA-256-sess
 * - qop: auth (default when qop is offered)
 */
export function computeDigestAuth(params: DigestParams): string {
  const { username, password, method, uri, challenge } = params;
  const { realm, nonce, qop, opaque } = challenge;
  const algorithm = challenge.algorithm || 'MD5';

  const hashFn = (data: string): string => {
    const algo = algorithm.replace(/-sess$/, '').toLowerCase() === 'sha-256' ? 'sha256' : 'md5';
    return crypto.createHash(algo).update(data).digest('hex');
  };

  // Single cnonce for the entire request (used for both -sess HA1 and qop=auth)
  const cnonce = generateCnonce();
  const nc = '00000001';

  // HA1
  let ha1 = hashFn(`${username}:${realm}:${password}`);
  if (algorithm.toLowerCase().endsWith('-sess')) {
    ha1 = hashFn(`${ha1}:${nonce}:${cnonce}`);
  }

  // HA2
  const ha2 = hashFn(`${method}:${uri}`);

  let response: string;
  let parts: string[];

  if (qop && qop.split(',').map(s => s.trim()).includes('auth')) {
    // qop=auth: response = hash(HA1:nonce:nc:cnonce:auth:HA2)
    response = hashFn(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`);
    parts = [
      `username="${username}"`,
      `realm="${realm}"`,
      `nonce="${nonce}"`,
      `uri="${uri}"`,
      `algorithm=${algorithm}`,
      `qop=auth`,
      `nc=${nc}`,
      `cnonce="${cnonce}"`,
      `response="${response}"`,
    ];
  } else {
    // No qop: response = hash(HA1:nonce:HA2)
    response = hashFn(`${ha1}:${nonce}:${ha2}`);
    parts = [
      `username="${username}"`,
      `realm="${realm}"`,
      `nonce="${nonce}"`,
      `uri="${uri}"`,
      `algorithm=${algorithm}`,
      `response="${response}"`,
    ];
  }

  if (opaque) {
    parts.push(`opaque="${opaque}"`);
  }

  return `Digest ${parts.join(', ')}`;
}

function generateCnonce(): string {
  return crypto.randomBytes(8).toString('hex');
}
