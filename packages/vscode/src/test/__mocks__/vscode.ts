// Mock VS Code API for testing

class MockUri {
  readonly scheme = 'file';
  readonly authority = '';
  readonly query = '';
  readonly fragment = '';

  constructor(readonly fsPath: string, readonly path = fsPath) {}

  toString(): string {
    return `file://${this.path}`;
  }
}

function createEmitter<T>() {
  const listeners: Array<(value: T) => void> = [];
  return {
    event: jest.fn((listener: (value: T) => void) => {
      listeners.push(listener);
      return {
        dispose: () => {
          const index = listeners.indexOf(listener);
          if (index >= 0) listeners.splice(index, 1);
        },
      };
    }),
    fire: jest.fn((value: T) => {
      for (const listener of [...listeners]) listener(value);
    }),
    dispose: jest.fn(() => { listeners.length = 0; }),
  };
}

const didOpenTextDocument = createEmitter<any>();
const didChangeTextDocument = createEmitter<any>();
const didCloseTextDocument = createEmitter<any>();

export const workspace = {
  workspaceFolders: [
    {
      uri: {
        fsPath: '/mock/workspace',
        path: '/mock/workspace',
        scheme: 'file',
        toString: () => 'file:///mock/workspace',
      },
      name: 'mock-workspace',
      index: 0,
    },
  ],
  getWorkspaceFolder: jest.fn(),
  getConfiguration: jest.fn().mockReturnValue({
    get: jest.fn(),
    update: jest.fn(),
  }),
  onDidChangeConfiguration: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  createFileSystemWatcher: jest.fn().mockReturnValue({
    onDidChange: jest.fn(),
    onDidCreate: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn(),
  }),
  textDocuments: [] as any[],
  asRelativePath: jest.fn((pathOrUri: any) =>
    typeof pathOrUri === 'string' ? pathOrUri : pathOrUri?.fsPath ?? pathOrUri?.path ?? String(pathOrUri)
  ),
  onDidOpenTextDocument: jest.fn((listener: (document: any) => void) =>
    didOpenTextDocument.event(listener)
  ),
  onDidChangeTextDocument: jest.fn((listener: (event: any) => void) =>
    didChangeTextDocument.event(listener)
  ),
  onDidCloseTextDocument: jest.fn((listener: (document: any) => void) =>
    didCloseTextDocument.event(listener)
  ),
  openTextDocument: jest.fn(),
  applyEdit: jest.fn().mockResolvedValue(true),
  fs: {
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(new Uint8Array()),
    delete: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ type: 1, size: 0 }),
    readDirectory: jest.fn().mockResolvedValue([]),
    createDirectory: jest.fn().mockResolvedValue(undefined),
  },
};

const didChangeActiveTextEditor = createEmitter<any>();
const didChangeTextEditorSelection = createEmitter<any>();
const didChangeTabs = createEmitter<any>();

export class TabInputText {
  constructor(readonly uri: { toString(): string }) {}
}

export interface FakeTreeView {
  viewId: string;
  options: any;
  visible: boolean;
  reveal: jest.Mock;
  dispose: jest.Mock;
  onDidChangeSelection: jest.Mock;
  onDidChangeVisibility: jest.Mock;
}

export const __treeViews = new Map<string, FakeTreeView>();

export const window = {
  activeTextEditor: undefined as any,
  onDidChangeActiveTextEditor: jest.fn((listener: (editor: any) => void) =>
    didChangeActiveTextEditor.event(listener)
  ),
  onDidChangeTextEditorSelection: jest.fn((listener: (event: any) => void) =>
    didChangeTextEditorSelection.event(listener)
  ),
  createTreeView: jest.fn((viewId: string, options: any): FakeTreeView => {
    const treeView: FakeTreeView = {
      viewId,
      options,
      visible: true,
      reveal: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn(),
      onDidChangeSelection: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      onDidChangeVisibility: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    };
    __treeViews.set(viewId, treeView);
    return treeView;
  }),
  registerWebviewPanelSerializer: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  showInformationMessage: jest.fn(),
  showErrorMessage: jest.fn(),
  showWarningMessage: jest.fn(),
  showInputBox: jest.fn(),
  showQuickPick: jest.fn(),
  showOpenDialog: jest.fn(),
  showSaveDialog: jest.fn(),
  showTextDocument: jest.fn(),
  createOutputChannel: jest.fn().mockReturnValue({
    appendLine: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
  }),
  createWebviewPanel: jest.fn(),
  setStatusBarMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  tabGroups: {
    all: [] as Array<{ tabs: Array<{ input: unknown }> }>,
    onDidChangeTabs: jest.fn((listener: (event: any) => void) => didChangeTabs.event(listener)),
  },
  // Runs the task immediately, mirroring VS Code resolving the returned promise.
  withProgress: jest.fn((_options: any, task: (...args: any[]) => any) =>
    task({ report: jest.fn() }, { isCancellationRequested: false, onCancellationRequested: jest.fn() })
  ),
};

export enum ProgressLocation {
  SourceControl = 1,
  Window = 10,
  Notification = 15,
}

export const commands = {
  registerCommand: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  executeCommand: jest.fn(),
};

export const env = {
  openExternal: jest.fn().mockResolvedValue(true),
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
    readText: jest.fn().mockResolvedValue(''),
  },
};

export const Uri = {
  file: (path: string) => new MockUri(path),
  parse: (uri: string) => new MockUri(uri.replace(/^file:\/\//, '')),
  joinPath: (base: any, ...segments: string[]) => {
    const joined = [base.fsPath || base.path, ...segments].join('/');
    return new MockUri(joined);
  },
};

export class Position {
  constructor(readonly line: number, readonly character: number) {}

  isEqual(other: Position): boolean {
    return this.line === other.line && this.character === other.character;
  }

  compareTo(other: Position): number {
    return this.line === other.line ? this.character - other.character : this.line - other.line;
  }
}

export class Range {
  readonly start: Position;
  readonly end: Position;

  constructor(start: Position, end: Position);
  constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number);
  constructor(
    startOrLine: Position | number,
    endOrCharacter: Position | number,
    endLine?: number,
    endCharacter?: number
  ) {
    if (startOrLine instanceof Position && endOrCharacter instanceof Position) {
      this.start = startOrLine;
      this.end = endOrCharacter;
    } else {
      this.start = new Position(startOrLine as number, endOrCharacter as number);
      this.end = new Position(endLine as number, endCharacter as number);
    }
  }

  get isEmpty(): boolean {
    return this.start.isEqual(this.end);
  }

  isEqual(other: Range): boolean {
    return this.start.isEqual(other.start) && this.end.isEqual(other.end);
  }

  contains(positionOrRange: Position | Range): boolean {
    const [from, to] = positionOrRange instanceof Range
      ? [positionOrRange.start, positionOrRange.end]
      : [positionOrRange, positionOrRange];
    return this.start.compareTo(from) <= 0 && this.end.compareTo(to) >= 0;
  }

  /** Overlapping range, or undefined when the ranges do not touch (VS Code semantics). */
  intersection(other: Range): Range | undefined {
    const start = this.start.compareTo(other.start) >= 0 ? this.start : other.start;
    const end = this.end.compareTo(other.end) <= 0 ? this.end : other.end;
    if (start.compareTo(end) > 0) return undefined;
    return new Range(start, end);
  }
}

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  source?: string;
  code?: string | number;

  constructor(
    public range: Range,
    public message: string,
    public severity = DiagnosticSeverity.Error
  ) {}
}

export enum SymbolKind {
  File = 0,
  Module = 1,
  Namespace = 2,
  Package = 3,
  Class = 4,
  Method = 5,
  Property = 6,
  Field = 7,
  Constructor = 8,
  Enum = 9,
  Interface = 10,
  Function = 11,
  Variable = 12,
  Constant = 13,
  String = 14,
  Number = 15,
  Boolean = 16,
  Array = 17,
  Object = 18,
  Key = 19,
  Null = 20,
  EnumMember = 21,
  Struct = 22,
  Event = 23,
  Operator = 24,
  TypeParameter = 25,
}

export class DocumentSymbol {
  children: DocumentSymbol[] = [];

  constructor(
    public name: string,
    public detail: string,
    public kind: SymbolKind,
    public range: Range,
    public selectionRange: Range
  ) {}
}

export interface MockCommand {
  title: string;
  command: string;
  tooltip?: string;
  arguments?: unknown[];
}

export class CodeLens {
  constructor(
    public range: Range,
    public command?: MockCommand
  ) {}

  get isResolved(): boolean {
    return this.command !== undefined;
  }
}

export class CodeActionKind {
  static readonly Empty = new CodeActionKind('');
  static readonly QuickFix = new CodeActionKind('quickfix');
  static readonly Refactor = new CodeActionKind('refactor');
  static readonly Source = new CodeActionKind('source');

  constructor(public readonly value: string) {}
}

export class CodeAction {
  edit?: WorkspaceEdit;
  diagnostics?: Diagnostic[];
  kind?: CodeActionKind;
  isPreferred?: boolean;

  constructor(public title: string, kind?: CodeActionKind) {
    this.kind = kind;
  }
}

export enum CompletionItemKind {
  Text = 0,
  Method = 1,
  Function = 2,
  Constructor = 3,
  Field = 4,
  Variable = 5,
  Class = 6,
  Interface = 7,
  Module = 8,
  Property = 9,
  Unit = 10,
  Value = 11,
  Enum = 12,
  Keyword = 13,
  Snippet = 14,
  Color = 15,
  File = 16,
  Reference = 17,
  Folder = 18,
  EnumMember = 19,
  Constant = 20,
  Struct = 21,
  Event = 22,
  Operator = 23,
  TypeParameter = 24,
}

export class SnippetString {
  constructor(public value = '') {}
}

export class MarkdownString {
  constructor(public value = '') {}

  appendMarkdown(value: string): this {
    this.value += value;
    return this;
  }
}

export class CompletionItem {
  detail?: string;
  documentation?: string | MarkdownString;
  insertText?: string | SnippetString;
  range?: Range;
  filterText?: string;
  sortText?: string;

  constructor(public label: string, public kind?: CompletionItemKind) {}
}

export class CompletionList {
  constructor(public items: CompletionItem[] = [], public isIncomplete = false) {}
}

export class Hover {
  contents: Array<string | MarkdownString>;

  constructor(contents: string | MarkdownString | Array<string | MarkdownString>, public range?: Range) {
    this.contents = Array.isArray(contents) ? contents : [contents];
  }
}

export interface FakeDiagnosticCollection {
  name: string;
  values: Map<string, readonly Diagnostic[]>;
  set(uri: MockUri, diagnostics: readonly Diagnostic[]): void;
  delete(uri: MockUri): void;
  clear(): void;
  get(uri: MockUri): readonly Diagnostic[] | undefined;
  dispose(): void;
}

export const __diagnosticCollections = new Map<string, FakeDiagnosticCollection>();

export const languages = {
  createDiagnosticCollection: jest.fn((name: string): FakeDiagnosticCollection => {
    const values = new Map<string, readonly Diagnostic[]>();
    const collection: FakeDiagnosticCollection = {
      name,
      values,
      set: jest.fn((uri: MockUri, diagnostics: readonly Diagnostic[]) => {
        values.set(uri.toString(), diagnostics);
      }),
      delete: jest.fn((uri: MockUri) => { values.delete(uri.toString()); }),
      clear: jest.fn(() => { values.clear(); }),
      get: jest.fn((uri: MockUri) => values.get(uri.toString())),
      dispose: jest.fn(() => { values.clear(); }),
    };
    __diagnosticCollections.set(name, collection);
    return collection;
  }),
  registerDocumentSymbolProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  registerDefinitionProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  registerCodeLensProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  registerCodeActionsProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  registerCompletionItemProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
  registerHoverProvider: jest.fn().mockReturnValue({ dispose: jest.fn() }),
};

export class Location {
  constructor(readonly uri: MockUri, readonly range: Range) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  id?: string;
  description?: string;
  tooltip?: string;
  iconPath?: unknown;
  command?: MockCommand;
  contextValue?: string;

  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None
  ) {}
}

export class ThemeIcon {
  constructor(readonly id: string, readonly color?: unknown) {}
}

export class ThemeColor {
  constructor(readonly id: string) {}
}

export class Selection extends Range {
  constructor(readonly anchor: Position, readonly active: Position) {
    super(anchor, active);
  }
}

export enum TextEditorRevealType {
  Default = 0,
  InCenter = 1,
  InCenterIfOutsideViewport = 2,
  AtTop = 3,
}

export enum EndOfLine {
  LF = 1,
  CRLF = 2,
}

export class TextEdit {
  static replace(range: Range, newText: string): TextEdit {
    return new TextEdit(range, newText);
  }

  static insert(position: Position, newText: string): TextEdit {
    return new TextEdit(new Range(position, position), newText);
  }

  static delete(range: Range): TextEdit {
    return new TextEdit(range, '');
  }

  constructor(public range: Range, public newText: string) {}
}

export class WorkspaceEdit {
  private readonly edits = new Map<string, TextEdit[]>();

  set(uri: { toString(): string }, edits: TextEdit[]): void {
    this.edits.set(uri.toString(), edits);
  }

  get(uri: { toString(): string }): TextEdit[] {
    return this.edits.get(uri.toString()) ?? [];
  }

  entries(): Array<[string, TextEdit[]]> {
    return [...this.edits.entries()];
  }

  get size(): number {
    return this.edits.size;
  }
}

export function __fireDidChangeActiveTextEditor(editor: any): void {
  window.activeTextEditor = editor;
  didChangeActiveTextEditor.fire(editor);
}

export function __fireDidChangeTextEditorSelection(event: any): void {
  didChangeTextEditorSelection.fire(event);
}

/** Replaces the mock tab set (one group) and fires onDidChangeTabs. */
export function __setOpenTabs(uris: Array<{ toString(): string }>): void {
  window.tabGroups.all = [{ tabs: uris.map((uri) => ({ input: new TabInputText(uri) })) }];
  didChangeTabs.fire({ opened: [], closed: [], changed: [] });
}

/** Minimal WebviewPanel double: records posted messages and runs dispose handlers. */
export function __createFakeWebviewPanel(viewType = 'nouto.openApiPreviewPanel') {
  const disposeHandlers: Array<() => void> = [];
  const messageHandlers: Array<(message: any) => void> = [];
  const viewStateHandlers: Array<(event: any) => void> = [];
  const panel: any = {
    viewType,
    title: '',
    disposed: false,
    posted: [] as any[],
    reveal: jest.fn(),
    webview: {
      html: '',
      cspSource: 'vscode-webview://mock',
      asWebviewUri: (uri: any) => uri,
      postMessage: jest.fn((message: any) => { panel.posted.push(message); return Promise.resolve(true); }),
      onDidReceiveMessage: jest.fn((handler: (message: any) => void) => {
        messageHandlers.push(handler);
        return { dispose: jest.fn() };
      }),
    },
    onDidDispose: jest.fn((handler: () => void) => {
      disposeHandlers.push(handler);
      return { dispose: jest.fn() };
    }),
    onDidChangeViewState: jest.fn((handler: (event: any) => void) => {
      viewStateHandlers.push(handler);
      return { dispose: jest.fn() };
    }),
    dispose: jest.fn(() => {
      if (panel.disposed) return;
      panel.disposed = true;
      for (const handler of [...disposeHandlers]) handler();
    }),
    __receive: (message: any) => { for (const handler of [...messageHandlers]) handler(message); },
    __fireViewStateChange: (active = true) => {
      panel.active = active;
      for (const handler of [...viewStateHandlers]) handler({ webviewPanel: panel });
    },
  };
  return panel;
}

export function __fireDidOpenTextDocument(document: any): void {
  didOpenTextDocument.fire(document);
}

export function __fireDidChangeTextDocument(document: any): void {
  didChangeTextDocument.fire({ document, contentChanges: [] });
}

export function __fireDidCloseTextDocument(document: any): void {
  didCloseTextDocument.fire(document);
}

export const EventEmitter = jest.fn().mockImplementation(() => {
  const listeners: Function[] = [];
  return {
    event: jest.fn((listener: Function) => {
      listeners.push(listener);
      return { dispose: () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); } };
    }),
    fire: jest.fn((data: any) => { listeners.forEach(l => l(data)); }),
    dispose: jest.fn(),
  };
});

export const ExtensionContext = jest.fn();

export enum ViewColumn {
  Active = -1,
  Beside = -2,
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

export enum QuickPickItemKind {
  Separator = -1,
  Default = 0,
}

export const RelativePattern = jest.fn().mockImplementation((base: string, pattern: string) => ({
  base,
  pattern,
}));

export const extensions = {
  getExtension: jest.fn(),
};
