import * as vscode from 'vscode';

/**
 * Focused on the draft-panel entry points. The manager's collaborators are
 * stubbed: what matters here is the panel identity, title, icon, and that a
 * draft never carries autoRun.
 */

const stubClass = () => jest.fn().mockImplementation(() => ({}));

jest.mock('../services/StorageService', () => ({
  StorageService: jest.fn().mockImplementation(() => ({
    getStorageDir: () => '/storage',
    loadEnvironments: jest.fn().mockResolvedValue({ environments: [], activeId: null }),
  })),
}));
jest.mock('../services/DraftService', () => ({
  DraftService: jest.fn().mockImplementation(() => ({
    remove: jest.fn(),
    findByRequestId: jest.fn(),
    get: jest.fn(),
  })),
}));
jest.mock('../services/FileService', () => ({ FileService: stubClass() }));
jest.mock('../services/SecretStorageService', () => ({ SecretStorageService: stubClass() }));
jest.mock('../services/UIService', () => ({
  UIService: jest.fn().mockImplementation(() => ({
    // Returning false lets the manager's own router handle the message.
    handleResponseMessage: jest.fn(() => false),
    dispose: jest.fn(),
  })),
}));
jest.mock('@nouto/core/services', () => ({
  OAuthService: stubClass(),
  ScriptEngine: stubClass(),
  GraphQLSchemaService: stubClass(),
  AwsSignatureService: stubClass(),
  CookieJarService: stubClass(),
}));
jest.mock('./panel/RequestBodyBuilder', () => ({ RequestBodyBuilder: stubClass() }));
jest.mock('./panel/RequestAuthHandler', () => ({ RequestAuthHandler: stubClass() }));
jest.mock('./panel/ScriptRunner', () => ({ ScriptRunner: stubClass() }));
jest.mock('./panel/RequestExecutor', () => ({ RequestExecutor: stubClass() }));
jest.mock('./panel/CollectionSaveHandler', () => ({ CollectionSaveHandler: stubClass() }));
jest.mock('./panel/ProtocolHandlers', () => ({ ProtocolHandlers: stubClass() }));
jest.mock('./panel/JsonExplorerPanelHandler', () => ({ JsonExplorerPanelHandler: stubClass() }));

import { RequestPanelManager } from './RequestPanelManager';
import type { SavedRequest } from '../services/types';

const mocked = vscode as unknown as {
  __createFakeWebviewPanel: (viewType?: string) => any;
};

function makeRequest(overrides: Partial<SavedRequest> = {}): SavedRequest {
  return {
    type: 'request',
    id: 'req-1',
    name: 'List pets',
    method: 'GET',
    url: 'https://api.example.com/v1/pets',
    params: [],
    headers: [],
    auth: { type: 'none' },
    body: { type: 'none', content: '' },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as SavedRequest;
}

describe('RequestPanelManager draft panels', () => {
  let manager: RequestPanelManager;
  let panels: any[];

  beforeEach(() => {
    jest.clearAllMocks();
    panels = [];
    (vscode.window.createWebviewPanel as jest.Mock).mockImplementation((viewType: string) => {
      const panel = mocked.__createFakeWebviewPanel(viewType);
      panels.push(panel);
      return panel;
    });

    (RequestPanelManager as unknown as { instance: unknown }).instance = null;
    manager = RequestPanelManager.getInstance(
      {
        extensionUri: vscode.Uri.file('/ext'),
        globalStorageUri: vscode.Uri.file('/global'),
        subscriptions: [],
      } as never,
      { setCookieJarHandler: jest.fn(), getCollections: () => [] } as never
    );
  });

  afterEach(() => {
    (RequestPanelManager as unknown as { instance: unknown }).instance = null;
  });

  it('opens with no collection or request identity', () => {
    manager.openDraftRequest(makeRequest());

    const [info] = [...manager.panels.values()];
    expect(info.requestId).toBeNull();
    expect(info.collectionId).toBeNull();
  });

  it('marks the tab as unsaved using the converted operation name', () => {
    manager.openDraftRequest(makeRequest({ name: 'List pets' }));

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'nouto.requestPanel',
      '* List pets',
      expect.anything(),
      expect.anything()
    );
  });

  it('falls back to method and URL when the operation has no name', () => {
    manager.openDraftRequest(makeRequest({ name: '' }));

    expect((vscode.window.createWebviewPanel as jest.Mock).mock.calls[0][1])
      .toBe('* GET https://api.example.com/v1/pets');
  });

  it('uses the method icon', () => {
    manager.openDraftRequest(makeRequest({ method: 'DELETE' }));

    expect(String(panels[0].iconPath.path)).toContain('delete.svg');
  });

  it('honors the requested view column', () => {
    manager.openDraftRequest(makeRequest(), { viewColumn: vscode.ViewColumn.Beside });

    expect((vscode.window.createWebviewPanel as jest.Mock).mock.calls[0][2])
      .toBe(vscode.ViewColumn.Beside);
  });

  it('never sends autoRun to the webview', () => {
    manager.openDraftRequest(makeRequest());

    panels[0].__receive({ type: 'ready' });

    const loadRequest = panels[0].posted.find(
      (message: { type: string }) => message.type === 'loadRequest'
    );
    expect(loadRequest?.data.autoRun).toBeUndefined();
    expect(loadRequest?.data._requestId).toBeNull();
    expect(loadRequest?.data._collectionId).toBeNull();
  });

  it('opens one panel per invocation, so a second Try It does not reuse the first', () => {
    manager.openDraftRequest(makeRequest());
    manager.openDraftRequest(makeRequest({ name: 'Create pet', method: 'POST' }));

    expect(manager.panels.size).toBe(2);
  });
});
