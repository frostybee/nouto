import type { Collection, Folder, SavedRequest, Environment, EnvironmentVariable, KeyValue } from '../../types';
import { generateId } from '../../types';

function now(): string {
  return new Date().toISOString();
}

function kv(key: string, value: string, enabled = true, description = ''): KeyValue {
  return { id: generateId(), key, value, enabled, description };
}

function makeRequest(
  name: string,
  method: SavedRequest['method'],
  url: string,
  overrides?: Partial<SavedRequest>
): SavedRequest {
  const ts = now();
  return {
    type: 'request',
    id: generateId(),
    name,
    method,
    url,
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function makeFolder(name: string, children: SavedRequest[], description?: string): Folder {
  const ts = now();
  return {
    type: 'folder',
    id: generateId(),
    name,
    children,
    expanded: true,
    description,
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Creates a sample httpbin.org collection with common HTTP request examples.
 * Each call generates fresh IDs so it's safe to call multiple times.
 */
export function createSampleCollection(): Collection {
  const ts = now();

  const basics = makeFolder('Basics', [
    makeRequest('GET Request', 'GET', '{{baseUrl}}/get', {
      params: [
        kv('foo', 'bar'),
        kv('search', 'hello world'),
      ],
      description: 'A simple GET request with query parameters. The httpbin /get endpoint echoes back the request details.',
    }),
    makeRequest('POST with JSON', 'POST', '{{baseUrl}}/post', {
      body: {
        type: 'json',
        content: JSON.stringify({ name: 'Nouto', version: 1, features: ['REST', 'GraphQL', 'WebSocket'] }, null, 2),
      },
      headers: [
        kv('Content-Type', 'application/json'),
      ],
      description: 'Send a POST request with a JSON body. The response will echo the sent data.',
    }),
    makeRequest('PUT Update', 'PUT', '{{baseUrl}}/put', {
      body: {
        type: 'json',
        content: JSON.stringify({ id: 1, name: 'Updated Item', active: true }, null, 2),
      },
      headers: [
        kv('Content-Type', 'application/json'),
      ],
      description: 'Send a PUT request to update a resource.',
    }),
    makeRequest('DELETE Request', 'DELETE', '{{baseUrl}}/delete', {
      description: 'Send a DELETE request. The response echoes the request details.',
    }),
  ], 'Basic HTTP methods: GET, POST, PUT, DELETE');

  const auth = makeFolder('Authentication', [
    makeRequest('Bearer Token', 'GET', '{{baseUrl}}/bearer', {
      auth: { type: 'bearer', token: '{{token}}' },
      description: 'Demonstrates Bearer token authentication. Set the {{token}} variable in your environment. The endpoint validates that a Bearer token is present.',
    }),
    makeRequest('Basic Auth', 'GET', '{{baseUrl}}/basic-auth/user/passwd', {
      auth: { type: 'basic', username: 'user', password: 'passwd' },
      description: 'Demonstrates HTTP Basic authentication. The endpoint expects username "user" and password "passwd".',
    }),
  ], 'Authentication examples: Bearer token and Basic auth');

  const advanced = makeFolder('Advanced', [
    makeRequest('Custom Headers', 'GET', '{{baseUrl}}/headers', {
      headers: [
        kv('X-Custom-Header', 'Nouto-Sample'),
        kv('Accept-Language', 'en-US'),
      ],
      description: 'Send custom headers. The response echoes all received headers.',
    }),
    makeRequest('Status Code 418', 'GET', '{{baseUrl}}/status/418', {
      description: 'Returns HTTP 418 "I\'m a teapot". Useful for testing how your client handles non-200 responses.',
    }),
    makeRequest('Delayed Response', 'GET', '{{baseUrl}}/delay/2', {
      description: 'Returns after a 2-second delay. Useful for testing timeouts and loading states.',
    }),
  ], 'Advanced examples: custom headers, status codes, delays');

  const variables: EnvironmentVariable[] = [
    { key: 'baseUrl', value: 'https://httpbin.org', enabled: true, description: 'Base URL for all requests' },
  ];

  return {
    id: generateId(),
    name: 'Sample Collection (httpbin.org)',
    items: [basics, auth, advanced],
    expanded: true,
    variables,
    description: 'A sample collection using httpbin.org, a free HTTP testing service. These requests demonstrate common HTTP patterns including different methods, authentication, custom headers, and more.',
    createdAt: ts,
    updatedAt: ts,
  };
}

/**
 * Creates a sample environment with variables used by the sample collection.
 */
export function createSampleEnvironment(): Environment {
  return {
    id: generateId(),
    name: 'Sample Environment',
    variables: [
      { key: 'baseUrl', value: 'https://httpbin.org', enabled: true, description: 'Base URL for httpbin.org API' },
      { key: 'token', value: 'my-sample-token', enabled: true, description: 'Sample bearer token (replace with a real token)' },
    ],
    color: '#4CAF50',
  };
}
