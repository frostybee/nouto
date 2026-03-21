/**
 * Header information including description and documentation links.
 */
export interface HeaderInfo {
	description: string;
	mdnUrl?: string;
	rfcUrl?: string;
}

/**
 * Descriptions and documentation links for common HTTP headers.
 * Shown as tooltips in the autocomplete dropdown.
 */
export const HTTP_HEADER_DESCRIPTIONS: Record<string, HeaderInfo> = {
	// Content Negotiation
	'A-IM': {
		description: 'Lists instance manipulations the client supports. Used with delta encoding to request only changes to a resource (RFC 3229).',
	},

	'Accept': {
		description: 'Specifies the content types the client can understand (e.g., application/json, text/html). The server uses this for content negotiation.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept'
	},

	'Accept-Charset': {
		description: 'Indicates which character encodings the client can understand (e.g., utf-8, iso-8859-1). Largely obsolete since UTF-8 is now universal.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Charset'
	},

	'Accept-Datetime': {
		description: 'Requests a past version of a resource by specifying a datetime. Used with Memento protocol for accessing archived content (RFC 7089).',
	},

	'Accept-Patch': {
		description: 'Specifies the media types the server accepts for PATCH requests (e.g., application/json-patch+json, application/merge-patch+json).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Patch'
	},

	'Authorization': {
		description: 'Contains credentials to authenticate the client with the server. Common schemes: Bearer, Basic, Digest.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Authorization'
	},

	'Content-Type': {
		description: 'Indicates the media type of the request body. Required for POST/PUT requests with data (e.g., application/json, multipart/form-data).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Type'
	},

	'Cookie': {
		description: 'Contains stored HTTP cookies previously sent by the server with Set-Cookie header. Used for session management and tracking.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cookie'
	},

	'User-Agent': {
		description: 'Identifies the client software making the request (browser, app, tool). Helps servers provide optimized responses.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/User-Agent'
	},

	// Content Negotiation
	'Accept-Encoding': {
		description: 'Specifies the encoding algorithms the client can understand (e.g., gzip, deflate, br). Used for compression.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding'
	},

	'Accept-Language': {
		description: 'Indicates the preferred language for the response (e.g., en-US, fr, es). Used for localization.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language'
	},

	// Caching
	'Cache-Control': {
		description: 'Directives for caching mechanisms. Controls how and for how long the response should be cached (e.g., no-cache, max-age=3600).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control'
	},

	'ETag': {
		description: 'Identifier for a specific version of a resource. Used for cache validation and preventing simultaneous updates.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag'
	},

	'If-None-Match': {
		description: 'Makes the request conditional. Server returns 304 Not Modified if the ETag matches, saving bandwidth.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match'
	},

	'If-Modified-Since': {
		description: 'Makes the request conditional. Server returns 304 Not Modified if resource unchanged since specified date.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Modified-Since'
	},

	// Standard Request Headers
	'Date': {
		description: 'The date and time the message was sent (RFC 7231 format). Automatically set by most HTTP clients.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Date'
	},

	'Expect': {
		description: 'Indicates expectations the server must meet. "100-continue" tells the server to wait for the body before responding with 100 Continue.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Expect'
	},

	'From': {
		description: 'Contains the email address of the user making the request. Typically used by automated agents or crawlers for contact purposes.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/From'
	},

	'If-Match': {
		description: 'Makes the request conditional. The server processes the request only if the resource ETag matches one of the listed values.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Match'
	},

	'If-Range': {
		description: 'Makes a range request conditional. If the resource has changed, the server sends the full resource instead of the requested range.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Range'
	},

	'If-Unmodified-Since': {
		description: 'Makes the request conditional. The server processes the request only if the resource has not been modified after the given date.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-Unmodified-Since'
	},

	'Max-Forwards': {
		description: 'Limits the number of times the request can be forwarded by proxies. Used with TRACE and OPTIONS methods for diagnostic purposes.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Max-Forwards'
	},

	// CORS
	'Origin': {
		description: 'Indicates the origin (scheme, host, port) of the request. Used by CORS to determine if cross-origin requests are allowed.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin'
	},

	'Access-Control-Allow-Origin': {
		description: 'Specifies which origins can access the resource. Use * for public APIs or specific origin for restricted access.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin'
	},

	'Access-Control-Allow-Methods': {
		description: 'Specifies which HTTP methods are allowed for cross-origin requests (e.g., GET, POST, PUT, DELETE).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Methods'
	},

	'Access-Control-Allow-Headers': {
		description: 'Specifies which headers can be used in the actual request during CORS preflight.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Headers'
	},

	// Security
	'Content-Security-Policy': {
		description: 'Controls which resources the browser is allowed to load. Helps prevent XSS attacks and other code injection.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy'
	},

	'Strict-Transport-Security': {
		description: 'Forces browsers to use HTTPS instead of HTTP. Helps prevent man-in-the-middle attacks.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security'
	},

	'X-Frame-Options': {
		description: 'Controls whether the page can be displayed in an iframe. Helps prevent clickjacking attacks (values: DENY, SAMEORIGIN).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options'
	},

	'X-Content-Type-Options': {
		description: 'Prevents browsers from MIME-sniffing. Should be set to "nosniff" to enhance security.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Content-Type-Options'
	},

	// Custom/Common API Headers
	'X-API-Key': {
		description: 'Custom header for API authentication. Contains the API key to authenticate the client with the service.'
	},

	'X-Request-ID': {
		description: 'Unique identifier for the request. Useful for tracing requests across distributed systems and debugging.'
	},

	'X-Forwarded-For': {
		description: 'Identifies the originating IP address of a client connecting through a proxy or load balancer.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-For'
	},

	'X-Forwarded-Proto': {
		description: 'Identifies the protocol (HTTP or HTTPS) that a client used to connect to your proxy or load balancer.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto'
	},

	// Connection
	'Connection': {
		description: 'Controls whether the network connection stays open after the current transaction (values: keep-alive, close).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Connection'
	},

	'Host': {
		description: 'Specifies the domain name of the server and optionally the port number. Required in HTTP/1.1.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host'
	},

	// Range Requests
	'Range': {
		description: 'Requests only part of a resource. Useful for resuming downloads or loading large files in chunks (e.g., bytes=0-1023).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Range'
	},

	'Accept-Ranges': {
		description: 'Indicates the server supports partial requests. Value "bytes" means range requests are supported.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Ranges'
	},

	// Other Useful Headers
	'Referer': {
		description: 'Contains the URL of the page that linked to the current resource. Useful for analytics and security checks.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referer'
	},

	'Upgrade': {
		description: 'Asks the server to upgrade to a different protocol (e.g., WebSocket, HTTP/2).',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Upgrade'
	},

	'Transfer-Encoding': {
		description: 'Specifies the encoding used to transfer the payload. "chunked" is commonly used for streaming responses.',
		mdnUrl: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Transfer-Encoding'
	},
};

/**
 * Get header information (description + links) for a header (case-insensitive)
 */
export function getHeaderDescription(headerName: string): HeaderInfo | undefined {
	// Try exact match first
	if (HTTP_HEADER_DESCRIPTIONS[headerName]) {
		return HTTP_HEADER_DESCRIPTIONS[headerName];
	}

	// Try case-insensitive match
	const normalizedName = Object.keys(HTTP_HEADER_DESCRIPTIONS).find(
		key => key.toLowerCase() === headerName.toLowerCase()
	);

	return normalizedName ? HTTP_HEADER_DESCRIPTIONS[normalizedName] : undefined;
}
