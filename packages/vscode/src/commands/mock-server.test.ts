import * as vscode from 'vscode';
import { registerOpenMockServerCommand } from './mock-server';

describe('registerOpenMockServerCommand', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register nouto.openMockServer command', () => {
    const openPanel = jest.fn();
    registerOpenMockServerCommand(openPanel);
    expect(mockRegisterCommand).toHaveBeenCalledWith(
      'nouto.openMockServer',
      expect.any(Function)
    );
  });

  it('should call openPanel when command is executed', async () => {
    const openPanel = jest.fn().mockResolvedValue(undefined);
    let cb: any;
    mockRegisterCommand.mockImplementation((_cmd: string, callback: any) => {
      cb = callback;
      return { dispose: jest.fn() };
    });

    registerOpenMockServerCommand(openPanel);
    await cb();

    expect(openPanel).toHaveBeenCalled();
  });
});
