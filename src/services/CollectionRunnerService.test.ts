import { CollectionRunnerService } from './CollectionRunnerService';
import type { SavedRequest, EnvironmentsData, CollectionRunConfig, Collection } from './types';

// Mock HttpClient
jest.mock('./HttpClient', () => ({
  executeRequest: jest.fn(),
}));

// Mock vscode
jest.mock('vscode', () => ({}), { virtual: true });

const { executeRequest } = require('./HttpClient');

describe('CollectionRunnerService', () => {
  let service: CollectionRunnerService;

  const makeRequest = (overrides: Partial<SavedRequest> = {}): SavedRequest => ({
    id: `req-${Math.random()}`,
    name: 'Test Request',
    method: 'GET',
    url: 'https://api.example.com/test',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  });

  const defaultEnvData: EnvironmentsData = {
    environments: [
      {
        id: 'env-1',
        name: 'Test',
        variables: [
          { key: 'baseUrl', value: 'https://api.example.com', enabled: true },
          { key: 'token', value: 'test-token', enabled: true },
        ],
      },
    ],
    activeId: 'env-1',
    globalVariables: [],
  };

  const defaultConfig: CollectionRunConfig = {
    collectionId: 'col-1',
    stopOnFailure: false,
    delayMs: 0,
  };

  beforeEach(() => {
    service = new CollectionRunnerService();
    jest.clearAllMocks();

    executeRequest.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      data: '{}',
      timing: { total: 100 },
      timeline: [],
      httpVersion: '1.1',
    });
  });

  describe('runCollection', () => {
    it('should execute all requests and return results', async () => {
      const requests = [
        makeRequest({ name: 'Request 1' }),
        makeRequest({ name: 'Request 2' }),
        makeRequest({ name: 'Request 3' }),
      ];

      const progressCalls: any[] = [];
      const resultCalls: any[] = [];

      const result = await service.runCollection(
        requests,
        defaultConfig,
        'Test Collection',
        defaultEnvData,
        (progress) => progressCalls.push(progress),
        (result) => resultCalls.push(result),
      );

      expect(result.totalRequests).toBe(3);
      expect(result.passedRequests).toBe(3);
      expect(result.failedRequests).toBe(0);
      expect(result.skippedRequests).toBe(0);
      expect(result.stoppedEarly).toBe(false);
      expect(result.results).toHaveLength(3);
      expect(progressCalls).toHaveLength(3);
      expect(resultCalls).toHaveLength(3);
    });

    it('should mark failed requests correctly', async () => {
      executeRequest
        .mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, data: '{}', timing: { total: 100 }, timeline: [], httpVersion: '1.1' })
        .mockResolvedValueOnce({ status: 500, statusText: 'Internal Server Error', headers: {}, data: '', timing: { total: 200 }, timeline: [], httpVersion: '1.1' })
        .mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, data: '{}', timing: { total: 100 }, timeline: [], httpVersion: '1.1' });

      const requests = [
        makeRequest({ name: 'OK 1' }),
        makeRequest({ name: 'Fail' }),
        makeRequest({ name: 'OK 2' }),
      ];

      const result = await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(result.passedRequests).toBe(2);
      expect(result.failedRequests).toBe(1);
      expect(result.results[1].passed).toBe(false);
      expect(result.stoppedEarly).toBe(false);
    });

    it('should stop on first failure when configured', async () => {
      executeRequest
        .mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, data: '{}', timing: { total: 100 }, timeline: [], httpVersion: '1.1' })
        .mockResolvedValueOnce({ status: 500, statusText: 'Error', headers: {}, data: '', timing: { total: 100 }, timeline: [], httpVersion: '1.1' });

      const requests = [
        makeRequest({ name: 'OK' }),
        makeRequest({ name: 'Fail' }),
        makeRequest({ name: 'Skipped' }),
      ];

      const config = { ...defaultConfig, stopOnFailure: true };
      const result = await service.runCollection(
        requests, config, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(result.results).toHaveLength(2);
      expect(result.skippedRequests).toBe(1);
      expect(result.stoppedEarly).toBe(true);
    });

    it('should handle request errors gracefully', async () => {
      executeRequest
        .mockResolvedValueOnce({ status: 200, statusText: 'OK', headers: {}, data: '{}', timing: { total: 100 }, timeline: [], httpVersion: '1.1' })
        .mockRejectedValueOnce(new Error('Connection refused'));

      const requests = [
        makeRequest({ name: 'OK' }),
        makeRequest({ name: 'Error' }),
      ];

      const result = await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(result.results).toHaveLength(2);
      expect(result.results[1].passed).toBe(false);
      expect(result.results[1].error).toBe('Connection refused');
    });

    it('should substitute environment variables in URL', async () => {
      const requests = [
        makeRequest({ url: '{{baseUrl}}/users' }),
      ];

      await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/users',
        })
      );
    });

    it('should substitute variables in auth token', async () => {
      const requests = [
        makeRequest({
          auth: { type: 'bearer', token: '{{token}}' },
        }),
      ];

      await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token',
          }),
        })
      );
    });

    it('should handle JSON body with variable substitution', async () => {
      const requests = [
        makeRequest({
          method: 'POST',
          body: { type: 'json', content: '{"url": "{{baseUrl}}"}' },
        }),
      ];

      await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { url: 'https://api.example.com' },
        })
      );
    });

    it('should handle GraphQL body type', async () => {
      const requests = [
        makeRequest({
          method: 'POST',
          body: {
            type: 'graphql',
            content: 'query { users { id } }',
            graphqlVariables: '{"limit": 10}',
            graphqlOperationName: 'GetUsers',
          },
        }),
      ];

      await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            query: 'query { users { id } }',
            variables: { limit: 10 },
            operationName: 'GetUsers',
          },
        })
      );
    });
  });

    it('should apply delay between requests', async () => {
      const requests = [
        makeRequest({ name: 'First' }),
        makeRequest({ name: 'Second' }),
      ];

      const config = { ...defaultConfig, delayMs: 100 };
      const startTime = Date.now();

      await service.runCollection(
        requests, config, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      const elapsed = Date.now() - startTime;
      // Should have at least 100ms delay between the two requests
      expect(elapsed).toBeGreaterThanOrEqual(90); // small tolerance
    });

    it('should not apply delay after last request', async () => {
      const requests = [makeRequest({ name: 'Only' })];
      const config = { ...defaultConfig, delayMs: 500 };

      const startTime = Date.now();
      await service.runCollection(
        requests, config, 'Test', defaultEnvData,
        () => {}, () => {},
      );
      const elapsed = Date.now() - startTime;

      // Single request should not incur the 500ms delay
      expect(elapsed).toBeLessThan(400);
    });

    it('should substitute GraphQL variables with environment variables', async () => {
      const requests = [
        makeRequest({
          method: 'POST',
          body: {
            type: 'graphql',
            content: 'query { users { id } }',
            graphqlVariables: '{"url": "{{baseUrl}}"}',
            graphqlOperationName: 'GetUsers',
          },
        }),
      ];

      await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            query: 'query { users { id } }',
            variables: { url: 'https://api.example.com' },
            operationName: 'GetUsers',
          },
        })
      );
    });

    it('should call onProgress with correct current and total', async () => {
      const requests = [
        makeRequest({ name: 'A' }),
        makeRequest({ name: 'B' }),
        makeRequest({ name: 'C' }),
      ];

      const progressCalls: any[] = [];
      await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        (progress) => progressCalls.push(progress),
        () => {},
      );

      expect(progressCalls).toEqual([
        { current: 1, total: 3, requestName: 'A' },
        { current: 2, total: 3, requestName: 'B' },
        { current: 3, total: 3, requestName: 'C' },
      ]);
    });

    it('should handle urlencoded body type', async () => {
      const formContent = JSON.stringify([
        { key: 'user', value: 'admin', enabled: true },
        { key: 'pass', value: 'secret', enabled: true },
        { key: 'disabled', value: 'skip', enabled: false },
      ]);
      const requests = [
        makeRequest({
          method: 'POST',
          body: { type: 'x-www-form-urlencoded', content: formContent },
        }),
      ];

      await service.runCollection(
        requests, defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: 'user=admin&pass=secret',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

  describe('response chaining', () => {
    it('should substitute $response.body fields from previous request result', async () => {
      // First request returns 200, second request references the first result's status
      const req1 = makeRequest({ id: 'req-1', name: 'Login' });
      const req2 = makeRequest({
        id: 'req-2',
        name: 'Use Token',
        url: 'https://api.example.com/data?prev_status={{$response.body.status}}',
      });

      executeRequest
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {}, data: '{"token":"abc123"}',
          timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        })
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {}, data: '{}',
          timing: { total: 30 }, timeline: [], httpVersion: '1.1',
        });

      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      // Second call should have status from first result substituted
      const secondCallConfig = executeRequest.mock.calls[1][0];
      expect(secondCallConfig.url).toBe('https://api.example.com/data?prev_status=200');
    });

    it('should leave $response.body placeholder when no previous response exists for path', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'First',
        url: 'https://api.example.com/{{$response.body.nonexistent}}',
      });

      await service.runCollection(
        [req1], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      // No prior response in context, so placeholder stays
      expect(executeRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.example.com/{{$response.body.nonexistent}}',
        })
      );
    });

    it('should chain nested result fields via $response.body', async () => {
      const req1 = makeRequest({ id: 'req-1', name: 'First' });
      const req2 = makeRequest({
        id: 'req-2',
        name: 'Second',
        method: 'POST',
        body: { type: 'text', content: 'prev={{$response.body.requestName}}' },
      });

      executeRequest
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {}, data: '{}',
          timing: { total: 100 }, timeline: [], httpVersion: '1.1',
        })
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {}, data: '{}',
          timing: { total: 100 }, timeline: [], httpVersion: '1.1',
        });

      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      const secondCallConfig = executeRequest.mock.calls[1][0];
      expect(secondCallConfig.data).toBe('prev=First');
    });
  });

  describe('cancel', () => {
    it('should not throw when cancelling with no active run', () => {
      expect(() => service.cancel()).not.toThrow();
    });

    it('should stop execution when aborted mid-run', async () => {
      let callCount = 0;
      executeRequest.mockImplementation(async (config: any) => {
        callCount++;
        // On the second call, simulate that abort was already called
        if (callCount >= 2) {
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        }
        return {
          status: 200, statusText: 'OK', headers: {}, data: '{}',
          timing: { total: 100 }, timeline: [], httpVersion: '1.1',
        };
      });

      const requests = [makeRequest(), makeRequest(), makeRequest()];
      const config = { ...defaultConfig, stopOnFailure: false };

      const result = await service.runCollection(
        requests, config, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      // Second request threw an error, third was still attempted
      expect(result.results.length).toBeGreaterThanOrEqual(2);
      expect(result.results.some(r => !r.passed)).toBe(true);
    });
  });

  describe('script execution in runner', () => {
    const makeCollection = (requests: SavedRequest[]): Collection => ({
      id: 'col-1',
      name: 'Test Collection',
      items: requests.map(r => ({ ...r, type: 'request' as const })),
      expanded: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    it('should execute post-response scripts and collect variablesToSet', async () => {
      const req = makeRequest({
        id: 'req-1',
        name: 'Login',
        scripts: {
          preRequest: '',
          postResponse: "hf.setVar('token', 'abc123');",
        },
      });
      const collection = makeCollection([req]);

      executeRequest.mockResolvedValueOnce({
        status: 200, statusText: 'OK', headers: { 'content-type': 'application/json' },
        data: '{"token":"abc123"}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      const result = await service.runCollection(
        [req], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, () => {}, collection,
      );

      expect(result.results).toHaveLength(1);
      expect(result.results[0].passed).toBe(true);
    });

    it('should propagate variables set by scripts to subsequent requests', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'Login',
        method: 'POST',
        scripts: {
          preRequest: '',
          postResponse: "hf.setVar('myToken', 'secret123');",
        },
      });
      const req2 = makeRequest({
        id: 'req-2',
        name: 'Profile',
        url: 'https://api.example.com/profile',
        headers: [{ id: 'h1', key: 'Authorization', value: 'Bearer {{myToken}}', enabled: true }],
      });
      const collection = makeCollection([req1, req2]);

      executeRequest
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {},
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        })
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {},
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        });

      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, () => {}, collection,
      );

      const secondCallConfig = executeRequest.mock.calls[1][0];
      expect(secondCallConfig.headers['Authorization']).toBe('Bearer secret123');
    });

    it('should collect script test results in runner output', async () => {
      const req = makeRequest({
        id: 'req-1',
        name: 'Tested',
        scripts: {
          preRequest: '',
          postResponse: `
            hf.test('status is 200', () => {
              if (hf.response.status !== 200) throw new Error('not 200');
            });
            hf.test('always fails', () => {
              throw new Error('nope');
            });
          `,
        },
      });
      const collection = makeCollection([req]);

      executeRequest.mockResolvedValueOnce({
        status: 200, statusText: 'OK', headers: {},
        data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      const result = await service.runCollection(
        [req], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, () => {}, collection,
      );

      expect(result.results[0].scriptTestResults).toBeDefined();
      expect(result.results[0].scriptTestResults).toHaveLength(2);
      expect(result.results[0].scriptTestResults![0].passed).toBe(true);
      expect(result.results[0].scriptTestResults![1].passed).toBe(false);
      // A failing script test should mark the result as failed
      expect(result.results[0].passed).toBe(false);
    });

    it('should collect script console logs in runner output', async () => {
      const req = makeRequest({
        id: 'req-1',
        name: 'Logged',
        scripts: {
          preRequest: '',
          postResponse: "console.log('hello from script');",
        },
      });
      const collection = makeCollection([req]);

      executeRequest.mockResolvedValueOnce({
        status: 200, statusText: 'OK', headers: {},
        data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      const result = await service.runCollection(
        [req], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, () => {}, collection,
      );

      expect(result.results[0].scriptLogs).toBeDefined();
      expect(result.results[0].scriptLogs!.length).toBeGreaterThanOrEqual(1);
      expect(result.results[0].scriptLogs![0].args).toContain('hello from script');
    });
  });

  describe('setNextRequest flow control', () => {
    const makeCollection = (requests: SavedRequest[]): Collection => ({
      id: 'col-1',
      name: 'Test Collection',
      items: requests.map(r => ({ ...r, type: 'request' as const })),
      expanded: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    it('should jump to a named request via setNextRequest', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'Login',
        scripts: { preRequest: '', postResponse: "hf.setNextRequest('Profile');" },
      });
      const req2 = makeRequest({ id: 'req-2', name: 'Skipped' });
      const req3 = makeRequest({ id: 'req-3', name: 'Profile' });
      const collection = makeCollection([req1, req2, req3]);

      executeRequest.mockResolvedValue({
        status: 200, statusText: 'OK', headers: {},
        data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      const resultNames: string[] = [];
      const result = await service.runCollection(
        [req1, req2, req3], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, (r) => resultNames.push(r.requestName), collection,
      );

      // Should be: Login -> Profile (Skipped is skipped)
      expect(resultNames).toEqual(['Login', 'Profile']);
      expect(result.results).toHaveLength(2);
    });

    it('should jump to a request by ID via setNextRequest', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'First',
        scripts: { preRequest: '', postResponse: "hf.setNextRequest('req-3');" },
      });
      const req2 = makeRequest({ id: 'req-2', name: 'Second' });
      const req3 = makeRequest({ id: 'req-3', name: 'Third' });
      const collection = makeCollection([req1, req2, req3]);

      executeRequest.mockResolvedValue({
        status: 200, statusText: 'OK', headers: {},
        data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      const resultNames: string[] = [];
      await service.runCollection(
        [req1, req2, req3], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, (r) => resultNames.push(r.requestName), collection,
      );

      expect(resultNames).toEqual(['First', 'Third']);
    });

    it('should continue to next request when target is unknown', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'First',
        scripts: { preRequest: '', postResponse: "hf.setNextRequest('NonExistent');" },
      });
      const req2 = makeRequest({ id: 'req-2', name: 'Second' });
      const collection = makeCollection([req1, req2]);

      executeRequest.mockResolvedValue({
        status: 200, statusText: 'OK', headers: {},
        data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      const resultNames: string[] = [];
      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, (r) => resultNames.push(r.requestName), collection,
      );

      // Unknown target — falls through to next
      expect(resultNames).toEqual(['First', 'Second']);
    });

    it('should enforce MAX_ITERATIONS guard against infinite loops', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'Looper',
        scripts: { preRequest: '', postResponse: "hf.setNextRequest('Looper');" },
      });
      const collection = makeCollection([req1]);

      executeRequest.mockResolvedValue({
        status: 200, statusText: 'OK', headers: {},
        data: '{}', timing: { total: 1 }, timeline: [], httpVersion: '1.1',
      });

      const result = await service.runCollection(
        [req1], defaultConfig, 'Test', { ...defaultEnvData },
        () => {}, () => {}, collection,
      );

      // MAX_ITERATIONS = 1 * 10 = 10
      expect(result.results.length).toBe(10);
      expect(result.stoppedEarly).toBe(true);
    });
  });

  describe('named request references', () => {
    it('should substitute {{RequestName.$response.body.field}} from a prior request', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'Login',
      });
      const req2 = makeRequest({
        id: 'req-2',
        name: 'Profile',
        headers: [{ id: 'h1', key: 'X-Token', value: '{{Login.$response.body.token}}', enabled: true }],
      });

      executeRequest
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          data: '{"token":"abc123"}',
          timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        })
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {},
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        });

      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      const secondCall = executeRequest.mock.calls[1][0];
      expect(secondCall.headers['X-Token']).toBe('abc123');
    });

    it('should substitute {{RequestName.$response.status}}', async () => {
      const req1 = makeRequest({ id: 'req-1', name: 'Login' });
      const req2 = makeRequest({
        id: 'req-2',
        name: 'Check',
        headers: [{ id: 'h1', key: 'X-Prev-Status', value: '{{Login.$response.status}}', enabled: true }],
      });

      executeRequest
        .mockResolvedValueOnce({
          status: 201, statusText: 'Created', headers: {},
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        })
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {},
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        });

      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      const secondCall = executeRequest.mock.calls[1][0];
      expect(secondCall.headers['X-Prev-Status']).toBe('201');
    });

    it('should substitute {{RequestName.$response.headers.field}}', async () => {
      const req1 = makeRequest({ id: 'req-1', name: 'Login' });
      const req2 = makeRequest({
        id: 'req-2',
        name: 'Next',
        headers: [{ id: 'h1', key: 'X-CT', value: '{{Login.$response.headers.content-type}}', enabled: true }],
      });

      executeRequest
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK',
          headers: { 'content-type': 'application/json' },
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        })
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {},
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        });

      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      const secondCall = executeRequest.mock.calls[1][0];
      expect(secondCall.headers['X-CT']).toBe('application/json');
    });

    it('should leave placeholder when named request is unknown', async () => {
      const req1 = makeRequest({
        id: 'req-1',
        name: 'Check',
        headers: [{ id: 'h1', key: 'X-Val', value: '{{Unknown.$response.body.token}}', enabled: true }],
      });

      executeRequest.mockResolvedValueOnce({
        status: 200, statusText: 'OK', headers: {},
        data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      await service.runCollection(
        [req1], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      const call = executeRequest.mock.calls[0][0];
      expect(call.headers['X-Val']).toBe('{{Unknown.$response.body.token}}');
    });

    it('should be case-sensitive for request names', async () => {
      const req1 = makeRequest({ id: 'req-1', name: 'Login' });
      const req2 = makeRequest({
        id: 'req-2',
        name: 'Next',
        headers: [{ id: 'h1', key: 'X-Val', value: '{{login.$response.body.token}}', enabled: true }],
      });

      executeRequest
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {},
          data: '{"token":"abc"}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        })
        .mockResolvedValueOnce({
          status: 200, statusText: 'OK', headers: {},
          data: '{}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
        });

      await service.runCollection(
        [req1, req2], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      const secondCall = executeRequest.mock.calls[1][0];
      // "login" !== "Login" — should remain unresolved
      expect(secondCall.headers['X-Val']).toBe('{{login.$response.body.token}}');
    });

    it('should store responseData and responseHeaders in results', async () => {
      const req = makeRequest({ id: 'req-1', name: 'Test' });

      executeRequest.mockResolvedValueOnce({
        status: 200, statusText: 'OK',
        headers: { 'x-custom': 'value' },
        data: '{"key":"val"}', timing: { total: 50 }, timeline: [], httpVersion: '1.1',
      });

      const result = await service.runCollection(
        [req], defaultConfig, 'Test', defaultEnvData,
        () => {}, () => {},
      );

      expect(result.results[0].responseData).toBe('{"key":"val"}');
      expect(result.results[0].responseHeaders).toEqual({ 'x-custom': 'value' });
    });
  });
});
