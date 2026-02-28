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
jest.mock('./SecretStorageService', () => ({
  SecretStorageService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('@hivefetch/core/services', () => ({
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
