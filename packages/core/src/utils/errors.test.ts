import { categorizeError, describeError, ensureErrorInfo, toReadableError } from './errors';

// Core targets ES2020, which has no AggregateError type; Node has the class
const NodeAggregateError = (globalThis as any).AggregateError as new (errors: unknown[], message?: string) => Error;

function codeError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/** What Node throws when every address of localhost refuses the connection. */
function refusedLocalhost(): Error {
  return Object.assign(
    new NodeAggregateError([
      codeError('connect ECONNREFUSED ::1:3000', 'ECONNREFUSED'),
      codeError('connect ECONNREFUSED 127.0.0.1:3000', 'ECONNREFUSED'),
    ], ''),
    { code: 'ECONNREFUSED' }
  );
}

describe('describeError', () => {
  it('returns an error\'s own message', () => {
    expect(describeError(new Error('socket hang up'))).toBe('socket hang up');
  });

  it('joins the inner messages of an empty-message aggregate', () => {
    expect(describeError(refusedLocalhost())).toBe(
      'connect ECONNREFUSED ::1:3000; connect ECONNREFUSED 127.0.0.1:3000'
    );
  });

  it('lists repeated inner messages once', () => {
    const error = new NodeAggregateError([new Error('boom'), new Error('boom')], '');
    expect(describeError(error)).toBe('boom');
  });

  it('falls back to the cause, then the code', () => {
    expect(describeError(Object.assign(new Error(''), { cause: new Error('inner') }))).toBe('inner');
    expect(describeError(codeError('', 'ECONNRESET'))).toBe('ECONNRESET');
  });

  it('describes strings and other thrown values', () => {
    expect(describeError('plain text')).toBe('plain text');
    expect(describeError(42)).toBe('42');
  });

  it('never returns an empty string', () => {
    expect(describeError(new NodeAggregateError([], ''))).toBe('Unknown error');
    expect(describeError({})).toBe('Unknown error');
    expect(describeError(undefined)).toBe('Unknown error');
  });
});

describe('toReadableError', () => {
  it('returns an error that already has a message', () => {
    const error = new Error('socket hang up');
    expect(toReadableError(error)).toBe(error);
  });

  it('returns abort errors unchanged', () => {
    const abort = Object.assign(new Error(''), { name: 'AbortError' });
    expect(toReadableError(abort)).toBe(abort);
  });

  it('gives an empty-message aggregate a message and keeps its code and cause', () => {
    const original = refusedLocalhost();
    const readable = toReadableError(original) as Error & { code?: string; cause?: unknown; errors?: unknown[] };
    expect(readable.message).toBe('connect ECONNREFUSED ::1:3000; connect ECONNREFUSED 127.0.0.1:3000');
    expect(readable.code).toBe('ECONNREFUSED');
    expect(readable.cause).toBe(original);
    expect(readable.errors).toHaveLength(2);
  });
});

describe('categorizeError', () => {
  it('reports a refused connection', () => {
    const info = categorizeError(describeError(refusedLocalhost()));
    expect(info.category).toBe('connection');
    expect(info.message).toBe('Connection refused');
  });

  it('prefers refused over a timeout on another address', () => {
    // Windows can time out on ::1 while 127.0.0.1 refuses
    expect(categorizeError('connect ETIMEDOUT ::1:3000; connect ECONNREFUSED 127.0.0.1:3000').category).toBe('connection');
  });

  it('still reports plain timeouts', () => {
    expect(categorizeError('timeout of 5000ms exceeded').category).toBe('timeout');
  });
});

describe('ensureErrorInfo', () => {
  it('categorizes a desktop failure from data.error', () => {
    const response = ensureErrorInfo({
      error: true,
      data: { error: 'Request failed: error sending request for url (http://localhost:3000/): tcp connect error (connection refused)' },
    });
    expect(response.errorInfo?.category).toBe('connection');
  });

  it('categorizes a string body', () => {
    expect(ensureErrorInfo({ error: true, data: 'getaddrinfo ENOTFOUND nope.invalid' }).errorInfo?.category).toBe('dns');
  });

  it('leaves successful responses and existing errorInfo alone', () => {
    const ok = { error: false, data: 'fine' };
    expect(ensureErrorInfo(ok)).toBe(ok);
    const categorized = {
      error: true,
      data: '',
      errorInfo: { category: 'ssl' as const, message: 'SSL/TLS certificate error', suggestion: '' },
    };
    expect(ensureErrorInfo(categorized)).toBe(categorized);
  });
});
