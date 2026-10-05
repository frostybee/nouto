import * as vscode from 'vscode';
import { registerOpenCookieJarsCommand, registerOpenEnvironmentsCommand } from './environments';

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
