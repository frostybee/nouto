import type * as vscode from 'vscode';
import {
  applyNoutoSettingsPatch,
  fireNoutoSettingsChanged,
  onNoutoSettingsChanged,
} from './settingsEvents';

function fakeContext(current: Record<string, unknown> = {}) {
  const update = jest.fn().mockResolvedValue(undefined);
  const context = {
    globalState: { get: jest.fn(() => current), update },
  } as unknown as vscode.ExtensionContext;
  return { context, update };
}

describe('settingsEvents', () => {
  it('notifies subscribers when fired', () => {
    const listener = jest.fn();
    const sub = onNoutoSettingsChanged(listener);
    fireNoutoSettingsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    sub.dispose();
    fireNoutoSettingsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('merges the patch into globalState and fires the event', async () => {
    const { context, update } = fakeContext({ existing: 1, openApiLintEnabled: true });
    const listener = jest.fn();
    const sub = onNoutoSettingsChanged(listener);

    await applyNoutoSettingsPatch(context, { openApiLintEnabled: false });

    expect(update).toHaveBeenCalledWith('nouto.settings', {
      existing: 1,
      openApiLintEnabled: false,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    sub.dispose();
  });

  it('starts from an empty object when nothing is stored', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const context = {
      globalState: { get: jest.fn(() => undefined), update },
    } as unknown as vscode.ExtensionContext;

    await applyNoutoSettingsPatch(context, { openApiOutlineSortAlphabetically: true });

    expect(update).toHaveBeenCalledWith('nouto.settings', {
      openApiOutlineSortAlphabetically: true,
    });
  });
});
