import { AwsSignatureService, AwsSignatureConfig, SignableRequest } from './AwsSignatureService';

describe('AwsSignatureService', () => {
  let service: AwsSignatureService;

  beforeEach(() => {
    service = new AwsSignatureService();
  });

  const baseConfig: AwsSignatureConfig = {
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    service: 's3',
  };

  const baseRequest: SignableRequest = {
    method: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    headers: {},
  };

  it('should return empty object when accessKey is missing', () => {
    const result = service.sign(baseRequest, { ...baseConfig, accessKey: '' });
    expect(result).toEqual({});
  });

  it('should return empty object when secretKey is missing', () => {
    const result = service.sign(baseRequest, { ...baseConfig, secretKey: '' });
    expect(result).toEqual({});
  });

  it('should return empty object when region is missing', () => {
    const result = service.sign(baseRequest, { ...baseConfig, region: '' });
    expect(result).toEqual({});
  });

  it('should return empty object when service is missing', () => {
    const result = service.sign(baseRequest, { ...baseConfig, service: '' });
    expect(result).toEqual({});
  });

  it('should produce Authorization header with correct format', () => {
    const result = service.sign(baseRequest, baseConfig);
    expect(result['Authorization']).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=.+, Signature=[a-f0-9]{64}$/);
  });

  it('should include x-amz-date header', () => {
    const result = service.sign(baseRequest, baseConfig);
    expect(result['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it('should include x-amz-content-sha256 header', () => {
    const result = service.sign(baseRequest, baseConfig);
    expect(result['x-amz-content-sha256']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should not include x-amz-security-token when sessionToken is absent', () => {
    const result = service.sign(baseRequest, baseConfig);
    expect(result['x-amz-security-token']).toBeUndefined();
  });

  it('should include x-amz-security-token when sessionToken is provided', () => {
    const result = service.sign(baseRequest, { ...baseConfig, sessionToken: 'FwoGZXIvYXdz...' });
    expect(result['x-amz-security-token']).toBe('FwoGZXIvYXdz...');
  });

  it('should sign POST requests with body', () => {
    const postRequest: SignableRequest = {
      method: 'POST',
      url: 'https://dynamodb.us-east-1.amazonaws.com/',
      headers: { 'Content-Type': 'application/json' },
      body: '{"TableName":"Users"}',
    };
    const result = service.sign(postRequest, { ...baseConfig, service: 'dynamodb' });
    expect(result['Authorization']).toContain('dynamodb');
    expect(result['x-amz-content-sha256']).toBeDefined();
  });

  it('should handle URLs with query parameters', () => {
    const request: SignableRequest = {
      method: 'GET',
      url: 'https://s3.amazonaws.com/bucket?prefix=photos&max-keys=100',
      headers: {},
    };
    const result = service.sign(request, baseConfig);
    expect(result['Authorization']).toBeDefined();
  });

  it('should produce different signatures for different methods', () => {
    const getResult = service.sign({ ...baseRequest, method: 'GET' }, baseConfig);
    const putResult = service.sign({ ...baseRequest, method: 'PUT' }, baseConfig);
    expect(getResult['Authorization']).not.toBe(putResult['Authorization']);
  });

  it('should produce different signatures for different regions', () => {
    const east = service.sign(baseRequest, { ...baseConfig, region: 'us-east-1' });
    const west = service.sign(baseRequest, { ...baseConfig, region: 'us-west-2' });
    expect(east['Authorization']).not.toBe(west['Authorization']);
    expect(east['Authorization']).toContain('us-east-1');
    expect(west['Authorization']).toContain('us-west-2');
  });

  it('should include host in signed headers', () => {
    const result = service.sign(baseRequest, baseConfig);
    expect(result['Authorization']).toContain('host');
  });

  it('should handle empty body as empty string hash', () => {
    const result1 = service.sign({ ...baseRequest, body: '' }, baseConfig);
    const result2 = service.sign({ ...baseRequest, body: undefined }, baseConfig);
    expect(result1['x-amz-content-sha256']).toBe(result2['x-amz-content-sha256']);
  });

  it('should handle Buffer body', () => {
    const request: SignableRequest = {
      method: 'PUT',
      url: 'https://s3.amazonaws.com/bucket/file.bin',
      headers: {},
      body: Buffer.from('binary content'),
    };
    const result = service.sign(request, baseConfig);
    expect(result['Authorization']).toBeDefined();
    expect(result['x-amz-content-sha256']).toBeDefined();
  });
});
