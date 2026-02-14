/**
 * Common HTTP header value suggestions mapped by header name.
 * Provides context-aware autocomplete for header values.
 */
export const HTTP_HEADER_VALUES: Record<string, string[]> = {
	// Content-Type / Accept
	'Content-Type': [
		'application/json',
		'application/xml',
		'application/x-www-form-urlencoded',
		'multipart/form-data',
		'text/html',
		'text/plain',
		'text/css',
		'text/javascript',
		'application/javascript',
		'application/pdf',
		'application/octet-stream',
		'application/zip',
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/svg+xml',
		'image/webp',
		'audio/mpeg',
		'video/mp4',
		'application/graphql',
		'application/ld+json',
		'application/vnd.api+json',
	],

	'Accept': [
		'application/json',
		'application/xml',
		'text/html',
		'text/plain',
		'application/pdf',
		'image/jpeg',
		'image/png',
		'image/webp',
		'*/*',
		'application/vnd.api+json',
		'application/ld+json',
	],

	// Encoding
	'Accept-Encoding': [
		'gzip',
		'deflate',
		'br',
		'compress',
		'identity',
		'*',
		'gzip, deflate, br',
	],

	'Content-Encoding': [
		'gzip',
		'deflate',
		'br',
		'compress',
		'identity',
	],

	// Language
	'Accept-Language': [
		'en-US',
		'en',
		'en-GB',
		'es',
		'fr',
		'de',
		'zh-CN',
		'ja',
		'pt-BR',
		'ru',
		'*',
	],

	'Content-Language': [
		'en-US',
		'en',
		'en-GB',
		'es',
		'fr',
		'de',
		'zh-CN',
		'ja',
		'pt-BR',
	],

	// Caching
	'Cache-Control': [
		'no-cache',
		'no-store',
		'max-age=0',
		'max-age=3600',
		'max-age=86400',
		'must-revalidate',
		'public',
		'private',
		'no-cache, no-store, must-revalidate',
		'public, max-age=3600',
		'private, max-age=0',
	],

	'Pragma': [
		'no-cache',
	],

	// Connection
	'Connection': [
		'keep-alive',
		'close',
		'upgrade',
	],

	'Keep-Alive': [
		'timeout=5, max=100',
		'timeout=120, max=500',
	],

	// Authorization
	'Authorization': [
		'Bearer ',
		'Basic ',
		'Digest ',
		'OAuth ',
		'AWS4-HMAC-SHA256 ',
		'Token ',
	],

	'WWW-Authenticate': [
		'Basic realm="Access to site"',
		'Bearer realm="Access to API"',
		'Digest realm="Access to site"',
	],

	// CORS
	'Access-Control-Allow-Origin': [
		'*',
		'https://example.com',
		'http://localhost:3000',
	],

	'Access-Control-Allow-Methods': [
		'GET, POST, PUT, DELETE, OPTIONS',
		'GET, POST, OPTIONS',
		'*',
	],

	'Access-Control-Allow-Headers': [
		'Content-Type, Authorization',
		'*',
		'X-Requested-With, Content-Type, Authorization',
	],

	'Access-Control-Allow-Credentials': [
		'true',
		'false',
	],

	'Access-Control-Max-Age': [
		'86400',
		'3600',
		'600',
	],

	// Security Headers
	'Content-Security-Policy': [
		"default-src 'self'",
		"default-src 'self'; script-src 'self' 'unsafe-inline'",
		"default-src 'self'; img-src 'self' data: https:; script-src 'self'",
	],

	'Strict-Transport-Security': [
		'max-age=31536000',
		'max-age=31536000; includeSubDomains',
		'max-age=31536000; includeSubDomains; preload',
	],

	'X-Content-Type-Options': [
		'nosniff',
	],

	'X-Frame-Options': [
		'DENY',
		'SAMEORIGIN',
		'ALLOW-FROM https://example.com',
	],

	'X-XSS-Protection': [
		'1; mode=block',
		'0',
	],

	'Referrer-Policy': [
		'no-referrer',
		'no-referrer-when-downgrade',
		'origin',
		'origin-when-cross-origin',
		'same-origin',
		'strict-origin',
		'strict-origin-when-cross-origin',
		'unsafe-url',
	],

	// Range
	'Range': [
		'bytes=0-1023',
		'bytes=0-',
		'bytes=-1024',
	],

	'Accept-Ranges': [
		'bytes',
		'none',
	],

	// Transfer
	'Transfer-Encoding': [
		'chunked',
		'compress',
		'deflate',
		'gzip',
		'identity',
	],

	'TE': [
		'trailers',
		'trailers, deflate',
		'deflate',
	],

	// Upgrade
	'Upgrade': [
		'websocket',
		'HTTP/2.0',
		'h2c',
	],

	// Vary
	'Vary': [
		'Accept-Encoding',
		'Origin',
		'User-Agent',
		'*',
		'Accept-Encoding, Origin',
	],

	// Custom/Common Headers
	'User-Agent': [
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
		'curl/7.64.1',
		'PostmanRuntime/7.26.8',
	],

	'Referer': [
		'https://example.com',
		'https://www.google.com',
	],

	'Origin': [
		'https://example.com',
		'http://localhost:3000',
		'http://localhost:8080',
	],

	'Host': [
		'api.example.com',
		'localhost:3000',
		'example.com',
	],

	// Status-related
	'Retry-After': [
		'120',
		'3600',
		'Wed, 21 Oct 2025 07:28:00 GMT',
	],

	// Expect
	'Expect': [
		'100-continue',
	],

	// If-* conditionals
	'If-Match': [
		'"etag-value"',
		'*',
	],

	'If-None-Match': [
		'"etag-value"',
		'*',
	],

	// DNT
	'DNT': [
		'1',
		'0',
	],

	// Save-Data
	'Save-Data': [
		'on',
	],

	// Upgrade-Insecure-Requests
	'Upgrade-Insecure-Requests': [
		'1',
	],

	// X-Requested-With
	'X-Requested-With': [
		'XMLHttpRequest',
	],

	// Common API headers
	'X-API-Key': [
		'your-api-key-here',
	],

	'X-Request-ID': [
		'unique-request-id',
	],

	'X-Forwarded-For': [
		'203.0.113.195',
		'203.0.113.195, 70.41.3.18',
	],

	'X-Forwarded-Proto': [
		'https',
		'http',
	],

	'X-Forwarded-Host': [
		'example.com',
	],

	'X-Real-IP': [
		'203.0.113.195',
	],

	// WebSocket
	'Sec-WebSocket-Version': [
		'13',
	],

	'Sec-WebSocket-Protocol': [
		'chat',
		'superchat',
	],

	// GraphQL
	'GraphQL-Preflight': [
		'1',
	],
};

/**
 * Get value suggestions for a given header name (case-insensitive)
 */
export function getHeaderValueSuggestions(headerName: string): string[] | undefined {
	// Try exact match first
	if (HTTP_HEADER_VALUES[headerName]) {
		return HTTP_HEADER_VALUES[headerName];
	}

	// Try case-insensitive match
	const normalizedName = Object.keys(HTTP_HEADER_VALUES).find(
		key => key.toLowerCase() === headerName.toLowerCase()
	);

	return normalizedName ? HTTP_HEADER_VALUES[normalizedName] : undefined;
}
