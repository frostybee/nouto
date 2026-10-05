import * as vscode from 'vscode';
import {
  buildEnvironmentPickItems,
  registerOpenCookieJarsCommand,
  registerOpenEnvironmentsCommand,
  registerSelectEnvironmentCommand,
} from './environments';

describe('registerOpenEnvironmentsCommand', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register nouto.openEnvironments command', () => {
    const openFn = jest.fn();
    registerOpenEnvironmentsCommand(openFn);
    expect(mockRegisterCommand).toHaveBeenCalledWith('nouto.openEnvironments', openFn);
  });

  it('should return a disposable', () => {
    mockRegisterCommand.mockReturnValue({ dispose: jest.fn() });
    const result = registerOpenEnvironmentsCommand(jest.fn());
    expect(result).toHaveProperty('dispose');
  });
});

describe('registerOpenCookieJarsCommand', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register nouto.openCookieJars command', () => {
    const openFn = jest.fn();
    registerOpenCookieJarsCommand(openFn);
    expect(mockRegisterCommand).toHaveBeenCalledWith('nouto.openCookieJars', openFn);
  });
});

describe('buildEnvironmentPickItems', () => {
  const envs = [
    { id: 'e1', name: 'Local', variables: [] },
    { id: 'e2', name: 'Production', variables: [] },
  ];

  it('lists No Environment, each environment, a separator, and Manage Environments', () => {
    const items = buildEnvironmentPickItems({ environments: envs, activeId: 'e2' } as any);
    expect(items.map(i => i.label)).toEqual([
      'No Environment',
      'Local',
      'Production',
      '',
      '$(gear) Manage Environments...',
    ]);
    expect(items[3].kind).toBe(vscode.QuickPickItemKind.Separator);
    expect(items[4].action).toBe('manage');
  });

  it('marks the active environment', () => {
    const items = buildEnvironmentPickItems({ environments: envs, activeId: 'e2' } as any);
    expect(items.filter(i => i.description === 'Active').map(i => i.label)).toEqual(['Production']);
  });

  it('marks No Environment when none is active', () => {
    const items = buildEnvironmentPickItems({ environments: envs, activeId: null } as any);
    expect(items.filter(i => i.description === 'Active').map(i => i.label)).toEqual(['No Environment']);
  });
});

describe('registerSelectEnvironmentCommand', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;
  const mockShowQuickPick = vscode.window.showQuickPick as jest.Mock;
  const data = { environments: [{ id: 'e1', name: 'Local', variables: [] }], activeId: null } as any;
  let deps: { getEnvironments: jest.Mock; setActiveEnvironment: jest.Mock; openEnvironmentsPanel: jest.Mock };

  async function runWithPick(pick: (items: any[]) => any): Promise<void> {
    mockShowQuickPick.mockImplementationOnce(async (items: any[]) => pick(items));
    registerSelectEnvironmentCommand(deps);
    const [id, callback] = mockRegisterCommand.mock.calls[0];
    expect(id).toBe('nouto.selectEnvironment');
    await callback();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    deps = {
      getEnvironments: jest.fn(() => data),
      setActiveEnvironment: jest.fn().mockResolvedValue(undefined),
      openEnvironmentsPanel: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('activates the picked environment', async () => {
    await runWithPick(items => items.find(i => i.label === 'Local'));
    expect(deps.setActiveEnvironment).toHaveBeenCalledWith('e1');
  });

  it('does nothing when the active environment is picked again', async () => {
    await runWithPick(items => items.find(i => i.label === 'No Environment'));
    expect(deps.setActiveEnvironment).not.toHaveBeenCalled();
  });

  it('does nothing when the picker is dismissed', async () => {
    await runWithPick(() => undefined);
    expect(deps.setActiveEnvironment).not.toHaveBeenCalled();
    expect(deps.openEnvironmentsPanel).not.toHaveBeenCalled();
  });

  it('opens the Environments panel for Manage Environments', async () => {
    await runWithPick(items => items.find(i => i.action === 'manage'));
    expect(deps.openEnvironmentsPanel).toHaveBeenCalled();
    expect(deps.setActiveEnvironment).not.toHaveBeenCalled();
  });
});
