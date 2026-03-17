import * as vscode from 'vscode';
import { registerOpenCommandPaletteCommand } from './palette';

describe('registerOpenCommandPaletteCommand', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should register nouto.openCommandPalette command', () => {
    const mockPaletteManager: any = { show: jest.fn() };
    registerOpenCommandPaletteCommand(mockPaletteManager);
    expect(mockRegisterCommand).toHaveBeenCalledWith(
      'nouto.openCommandPalette',
      expect.any(Function)
    );
  });

  it('should call paletteManager.show when command is executed', () => {
    const mockPaletteManager: any = { show: jest.fn() };
    let cb: any;
    mockRegisterCommand.mockImplementation((_cmd: string, callback: any) => {
      cb = callback;
      return { dispose: jest.fn() };
    });

    registerOpenCommandPaletteCommand(mockPaletteManager);
    cb();

    expect(mockPaletteManager.show).toHaveBeenCalled();
  });
});
