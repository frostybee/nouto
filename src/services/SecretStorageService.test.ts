import { SecretStorageService } from './SecretStorageService';

// Mock VS Code SecretStorage
function createMockContext(): any {
  const storage = new Map<string, string>();
  return {
    secrets: {
      store: jest.fn(async (key: string, value: string) => { storage.set(key, value); }),
      get: jest.fn(async (key: string) => storage.get(key)),
      delete: jest.fn(async (key: string) => { storage.delete(key); }),
    },
  };
}

describe('SecretStorageService', () => {
  let service: SecretStorageService;
  let mockContext: any;

  beforeEach(() => {
    mockContext = createMockContext();
    service = new SecretStorageService(mockContext);
  });

  it('should store and retrieve a secret', async () => {
    await service.store('env-1', 'API_KEY', 'super-secret');
    const value = await service.get('env-1', 'API_KEY');
    expect(value).toBe('super-secret');
  });

  it('should return undefined for non-existent secret', async () => {
    const value = await service.get('env-1', 'MISSING');
    expect(value).toBeUndefined();
  });

  it('should delete a secret', async () => {
    await service.store('env-1', 'TOKEN', 'value');
    await service.delete('env-1', 'TOKEN');
    const value = await service.get('env-1', 'TOKEN');
    expect(value).toBeUndefined();
  });

  it('should store secrets per environment', async () => {
    await service.store('env-1', 'KEY', 'value-1');
    await service.store('env-2', 'KEY', 'value-2');
    expect(await service.get('env-1', 'KEY')).toBe('value-1');
    expect(await service.get('env-2', 'KEY')).toBe('value-2');
  });

  it('should resolve secret variables', async () => {
    await service.store('env-1', 'DB_PASSWORD', 'secretpass');

    const variables = [
      { key: 'BASE_URL', value: 'http://localhost', enabled: true },
      { key: 'DB_PASSWORD', value: '', enabled: true, isSecret: true, secretRef: 'DB_PASSWORD' },
    ];

    const resolved = await service.resolveSecrets('env-1', variables);
    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toEqual({ key: 'BASE_URL', value: 'http://localhost', enabled: true });
    expect(resolved[1]).toEqual({ key: 'DB_PASSWORD', value: 'secretpass', enabled: true });
  });

  it('should resolve missing secret as empty string', async () => {
    const variables = [
      { key: 'MISSING_SECRET', value: '', enabled: true, isSecret: true, secretRef: 'MISSING_SECRET' },
    ];

    const resolved = await service.resolveSecrets('env-1', variables);
    expect(resolved[0].value).toBe('');
  });

  it('should store and return secret ref', async () => {
    const ref = await service.storeAsSecret('env-1', 'API_KEY', 'my-key');
    expect(ref).toBe('API_KEY');
    const value = await service.get('env-1', ref);
    expect(value).toBe('my-key');
  });

  it('should overwrite existing secret', async () => {
    await service.store('env-1', 'KEY', 'old');
    await service.store('env-1', 'KEY', 'new');
    expect(await service.get('env-1', 'KEY')).toBe('new');
  });
});
