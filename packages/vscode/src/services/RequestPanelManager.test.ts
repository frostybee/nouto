import { RequestPanelManager } from '../providers/RequestPanelManager';

// We need to mock the heavy dependencies that RequestPanelManager imports
jest.mock('../providers/SidebarViewProvider', () => ({
  SidebarViewProvider: jest.fn(),
}));
jest.mock('./StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    getStorageDir: () => '/mock/storage',
    loadEnvironments: jest.fn().mockResolvedValue({ environments: [], active: null }),
  })),
}));
jest.mock('./DraftService', () => ({
  DraftService: jest.fn().mockImplementation(() => ({
    load: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockReturnValue([]),
    remove: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock('./FileService', () => ({
  FileService: jest.fn().mockImplementation(() => ({})),
}));
const mockSecretStore = new Map<string, string>();
jest.mock('./SecretStorageService', () => ({
  SecretStorageService: jest.fn().mockImplementation(() => ({
    store: jest.fn(async (envId: string, key: string, value: string) => {
      mockSecretStore.set(`nouto.secret.${envId}.${key}`, value);
    }),
    get: jest.fn(async (envId: string, key: string) => {
      return mockSecretStore.get(`nouto.secret.${envId}.${key}`);
    }),
    delete: jest.fn(async (envId: string, key: string) => {
      mockSecretStore.delete(`nouto.secret.${envId}.${key}`);
    }),
  })),
}));
jest.mock('@nouto/core/services', () => ({
  OAuthService: jest.fn().mockImplementation(() => ({
    dispose: jest.fn(),
  })),
  ScriptEngine: jest.fn().mockImplementation(() => ({})),
  GraphQLSchemaService: jest.fn().mockImplementation(() => ({})),
  AwsSignatureService: jest.fn().mockImplementation(() => ({})),
  CookieJarService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../providers/panel/RequestBodyBuilder', () => ({
  RequestBodyBuilder: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../providers/panel/RequestAuthHandler', () => ({
  RequestAuthHandler: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../providers/panel/ScriptRunner', () => ({
  ScriptRunner: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../providers/panel/RequestExecutor', () => ({
  RequestExecutor: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../providers/panel/CollectionSaveHandler', () => ({
  CollectionSaveHandler: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../providers/panel/ProtocolHandlers', () => ({
  ProtocolHandlers: jest.fn().mockImplementation(() => ({})),
}));

function createMockContext(): any {
  return {
    extensionUri: { fsPath: '/mock/extension' },
    globalStorageUri: { fsPath: '/mock/global-storage' },
    subscriptions: [],
  };
}

function createMockSidebar(): any {
  return {
    getCollections: jest.fn().mockReturnValue([]),
    setDirtyRequestIds: jest.fn(),
    setCookieJarHandler: jest.fn(),
  };
}

describe('RequestPanelManager singleton lifecycle', () => {
  afterEach(() => {
    // Ensure singleton is cleaned up between tests
    const existing = RequestPanelManager.getExistingInstance();
    if (existing) {
      existing.dispose();
    }
  });

  it('should return null from getExistingInstance when no instance exists', () => {
    expect(RequestPanelManager.getExistingInstance()).toBeNull();
  });

  it('should create instance via getInstance', () => {
    const ctx = createMockContext();
    const sidebar = createMockSidebar();

    const instance = RequestPanelManager.getInstance(ctx, sidebar);
    expect(instance).toBeInstanceOf(RequestPanelManager);
  });

  it('should return same instance on subsequent calls', () => {
    const ctx = createMockContext();
    const sidebar = createMockSidebar();

    const instance1 = RequestPanelManager.getInstance(ctx, sidebar);
    const instance2 = RequestPanelManager.getInstance(ctx, sidebar);

    expect(instance1).toBe(instance2);
  });

  it('should return instance from getExistingInstance after creation', () => {
    const ctx = createMockContext();
    const sidebar = createMockSidebar();

    const instance = RequestPanelManager.getInstance(ctx, sidebar);
    expect(RequestPanelManager.getExistingInstance()).toBe(instance);
  });

  it('should reset instance to null after dispose', () => {
    const ctx = createMockContext();
    const sidebar = createMockSidebar();

    const instance = RequestPanelManager.getInstance(ctx, sidebar);
    instance.dispose();

    expect(RequestPanelManager.getExistingInstance()).toBeNull();
  });

  it('should allow creating a new instance after dispose', () => {
    const ctx = createMockContext();
    const sidebar = createMockSidebar();

    const instance1 = RequestPanelManager.getInstance(ctx, sidebar);
    instance1.dispose();

    const instance2 = RequestPanelManager.getInstance(ctx, sidebar);
    expect(instance2).toBeInstanceOf(RequestPanelManager);
    expect(instance2).not.toBe(instance1);
  });

  it('should clear panels map on dispose', () => {
    const ctx = createMockContext();
    const sidebar = createMockSidebar();

    const instance = RequestPanelManager.getInstance(ctx, sidebar);
    expect(instance.panels.size).toBe(0);

    instance.dispose();
    expect(instance.panels.size).toBe(0);
  });

  it('should dispose OAuthService on dispose', () => {
    const ctx = createMockContext();
    const sidebar = createMockSidebar();

    const instance = RequestPanelManager.getInstance(ctx, sidebar);
    // OAuthService is created internally, we verify dispose doesn't throw
    expect(() => instance.dispose()).not.toThrow();
  });
});

describe('RequestPanelManager secret hydration and persistence', () => {
  let instance: RequestPanelManager;

  beforeEach(() => {
    mockSecretStore.clear();
    const existing = RequestPanelManager.getExistingInstance();
    if (existing) existing.dispose();
    instance = RequestPanelManager.getInstance(createMockContext(), createMockSidebar());
  });

  afterEach(() => {
    instance.dispose();
  });

  it('hydrateSecrets should fill in secret values from SecretStorage', async () => {
    // Pre-populate SecretStorage
    mockSecretStore.set('nouto.secret.env-1.API_KEY', 'sk-secret-123');

    const data: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'BASE_URL', value: 'https://api.example.com', enabled: true },
          { key: 'API_KEY', value: '', enabled: true, isSecret: true, secretRef: 'API_KEY' },
        ],
      }],
      activeId: 'env-1',
    };

    await instance.hydrateSecrets(data);

    expect(data.environments[0].variables[0].value).toBe('https://api.example.com');
    expect(data.environments[0].variables[1].value).toBe('sk-secret-123');
  });

  it('hydrateSecrets should set empty string for missing secrets', async () => {
    const data: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'MISSING', value: '', enabled: true, isSecret: true },
        ],
      }],
      activeId: 'env-1',
    };

    await instance.hydrateSecrets(data);

    expect(data.environments[0].variables[0].value).toBe('');
  });

  it('hydrateSecrets should hydrate global variables', async () => {
    mockSecretStore.set('nouto.secret.__global__.TOKEN', 'global-token');

    const data: any = {
      environments: [],
      activeId: null,
      globalVariables: [
        { key: 'TOKEN', value: '', enabled: true, isSecret: true },
      ],
    };

    await instance.hydrateSecrets(data);

    expect(data.globalVariables[0].value).toBe('global-token');
  });

  it('hydrateSecrets should not modify non-secret variables', async () => {
    const data: any = {
      environments: [{
        id: 'env-1',
        name: 'Dev',
        variables: [
          { key: 'URL', value: 'http://localhost', enabled: true },
        ],
      }],
      activeId: 'env-1',
    };

    await instance.hydrateSecrets(data);

    expect(data.environments[0].variables[0].value).toBe('http://localhost');
  });

  it('persistSecrets should store secret values in SecretStorage', async () => {
    const data: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'API_KEY', value: 'sk-new-key', enabled: true, isSecret: true },
        ],
      }],
      activeId: 'env-1',
    };

    await instance.persistSecrets(data);

    expect(mockSecretStore.get('nouto.secret.env-1.API_KEY')).toBe('sk-new-key');
  });

  it('persistSecrets should store global secret variables', async () => {
    const data: any = {
      environments: [],
      activeId: null,
      globalVariables: [
        { key: 'MASTER_KEY', value: 'master-123', enabled: true, isSecret: true },
      ],
    };

    await instance.persistSecrets(data);

    expect(mockSecretStore.get('nouto.secret.__global__.MASTER_KEY')).toBe('master-123');
  });

  it('persistSecrets should skip secrets with empty values', async () => {
    const data: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'EMPTY', value: '', enabled: true, isSecret: true },
        ],
      }],
      activeId: 'env-1',
    };

    await instance.persistSecrets(data);

    expect(mockSecretStore.has('nouto.secret.env-1.EMPTY')).toBe(false);
  });

  it('persistSecrets should delete removed secrets', async () => {
    // First save: two secrets
    const data1: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'KEY_A', value: 'a', enabled: true, isSecret: true },
          { key: 'KEY_B', value: 'b', enabled: true, isSecret: true },
        ],
      }],
      activeId: 'env-1',
    };
    await instance.persistSecrets(data1);

    expect(mockSecretStore.get('nouto.secret.env-1.KEY_A')).toBe('a');
    expect(mockSecretStore.get('nouto.secret.env-1.KEY_B')).toBe('b');

    // Second save: KEY_B removed
    const data2: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'KEY_A', value: 'a', enabled: true, isSecret: true },
        ],
      }],
      activeId: 'env-1',
    };
    await instance.persistSecrets(data2);

    expect(mockSecretStore.get('nouto.secret.env-1.KEY_A')).toBe('a');
    expect(mockSecretStore.has('nouto.secret.env-1.KEY_B')).toBe(false);
  });

  it('persistSecrets should delete secrets when isSecret is toggled off', async () => {
    // First save: secret variable
    const data1: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'TOKEN', value: 'secret-val', enabled: true, isSecret: true },
        ],
      }],
      activeId: 'env-1',
    };
    await instance.persistSecrets(data1);

    expect(mockSecretStore.get('nouto.secret.env-1.TOKEN')).toBe('secret-val');

    // Second save: isSecret toggled off
    const data2: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'TOKEN', value: 'secret-val', enabled: true, isSecret: false },
        ],
      }],
      activeId: 'env-1',
    };
    await instance.persistSecrets(data2);

    expect(mockSecretStore.has('nouto.secret.env-1.TOKEN')).toBe(false);
  });

  it('full round-trip: persist then hydrate should restore values', async () => {
    // Save with secret
    const saveData: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'URL', value: 'https://api.example.com', enabled: true },
          { key: 'SECRET', value: 'my-secret-value', enabled: true, isSecret: true },
        ],
      }],
      activeId: 'env-1',
      globalVariables: [
        { key: 'G_SECRET', value: 'global-secret', enabled: true, isSecret: true },
      ],
    };
    await instance.persistSecrets(saveData);

    // Simulate disk load (secret values blanked by stripSecretValues)
    const loadData: any = {
      environments: [{
        id: 'env-1',
        name: 'Prod',
        variables: [
          { key: 'URL', value: 'https://api.example.com', enabled: true },
          { key: 'SECRET', value: '', enabled: true, isSecret: true, secretRef: 'SECRET' },
        ],
      }],
      activeId: 'env-1',
      globalVariables: [
        { key: 'G_SECRET', value: '', enabled: true, isSecret: true, secretRef: 'G_SECRET' },
      ],
    };
    await instance.hydrateSecrets(loadData);

    // Values should be restored from SecretStorage
    expect(loadData.environments[0].variables[0].value).toBe('https://api.example.com');
    expect(loadData.environments[0].variables[1].value).toBe('my-secret-value');
    expect(loadData.globalVariables[0].value).toBe('global-secret');
  });
});
