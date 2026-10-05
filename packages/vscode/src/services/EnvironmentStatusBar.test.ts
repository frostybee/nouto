import * as vscode from 'vscode';
import { EnvironmentStatusBar } from './EnvironmentStatusBar';

const { __setActiveTabs, TabInputText, TabInputWebview } = vscode as any;

describe('EnvironmentStatusBar', () => {
  let bar: EnvironmentStatusBar;
  let item: any;

  beforeEach(() => {
    jest.clearAllMocks();
    __setActiveTabs([]);
    bar = new EnvironmentStatusBar();
    item = (vscode.window.createStatusBarItem as jest.Mock).mock.results[0].value;
  });

  afterEach(() => {
    bar.dispose();
  });

  it('creates a named item that opens the environment picker', () => {
    expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
      'nouto.environment',
      vscode.StatusBarAlignment.Right,
      100
    );
    expect(item.name).toBe('Nouto Environment');
    expect(item.command).toBe('nouto.selectEnvironment');
  });

  it('shows the active environment name', () => {
    bar.update({ environments: [{ id: 'e1', name: 'Production', variables: [] }], activeId: 'e1' } as any);
    expect(item.text).toBe('$(symbol-variable) Production');
  });

  it('shows "No Environment" when none is active', () => {
    bar.update({ environments: [{ id: 'e1', name: 'Production', variables: [] }], activeId: null } as any);
    expect(item.text).toBe('$(symbol-variable) No Environment');
  });

  it('starts hidden when neither the sidebar nor a Nouto tab is visible', () => {
    expect(item.hide).toHaveBeenCalled();
    expect(item.show).not.toHaveBeenCalled();
  });

  it('follows the sidebar visibility', () => {
    bar.setSidebarVisible(true);
    expect(item.show).toHaveBeenCalledTimes(1);
    item.hide.mockClear();
    bar.setSidebarVisible(false);
    expect(item.hide).toHaveBeenCalledTimes(1);
  });

  it('shows while any editor group displays a Nouto webview', () => {
    __setActiveTabs([new TabInputText({ toString: () => 'file:///a.json' }), new TabInputWebview('mainThreadWebview-nouto.requestPanel')]);
    expect(item.show).toHaveBeenCalledTimes(1);
  });

  it('hides for other editor tabs', () => {
    __setActiveTabs([new TabInputWebview('nouto.requestPanel')]);
    item.hide.mockClear();
    __setActiveTabs([new TabInputWebview('markdown.preview'), new TabInputText({ toString: () => 'file:///a.ts' })]);
    expect(item.hide).toHaveBeenCalledTimes(1);
  });

  it('disposes the item', () => {
    bar.dispose();
    expect(item.dispose).toHaveBeenCalled();
  });
});
