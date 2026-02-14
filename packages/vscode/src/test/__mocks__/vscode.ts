// Mock VS Code API for testing

export const workspace = {
  workspaceFolders: [
    {
      uri: {
        fsPath: '/mock/workspace',
      },
      name: 'mock-workspace',
      index: 0,
    },
  ],
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn(),
    update: jest.fn(),
  }),
  onDidChangeConfiguration: jest.fn(),
};

export const window = {
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn(),
  createOutputChannel: jest.fn().mockReturnValue({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  }),
  createWebviewPanel: jest.fn(),
};

export const commands = {
  registerCommand: jest.fn(),
  executeCommand: jest.fn(),
};

export const Uri = {
  file: (path: string) => ({
    fsPath: path,
    path,
    scheme: 'file',
  }),
  parse: (uri: string) => ({
    fsPath: uri,
    path: uri,
    scheme: 'file',
  }),
};

export const EventEmitter = jest.fn().mockImplementation(() => ({
  event: jest.fn(),
  fire: jest.fn(),
  dispose: jest.fn(),
}));

export const ExtensionContext = jest.fn();

export enum ViewColumn {
  One = 1,
  Two = 2,
  Three = 3,
}

export enum ExtensionMode {
  Production = 1,
  Development = 2,
  Test = 3,
}

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

export const extensions = {
  getExtension: jest.fn(),
};
