import * as vscode from 'vscode';
import { registerBenchmarkCommand } from './benchmark';

describe('registerBenchmarkCommand', () => {
  const mockRegisterCommand = vscode.commands.registerCommand as jest.Mock;
  let commandCallback: (...args: any[]) => Promise<void>;
  const mockOpenPanel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisterCommand.mockImplementation((_cmd: string, cb: any) => {
      commandCallback = cb;
      return { dispose: jest.fn() };
    });
    registerBenchmarkCommand(mockOpenPanel);
  });

  it('should register the nouto.benchmarkRequest command', () => {
    expect(mockRegisterCommand).toHaveBeenCalledWith(
      'nouto.benchmarkRequest',
      expect.any(Function)
    );
  });

  it('should call openPanel with requestId and collectionId', async () => {
    await commandCallback('req-1', 'col-1');
    expect(mockOpenPanel).toHaveBeenCalledWith('req-1', 'col-1');
  });

  it('should show error when no requestId is provided', async () => {
    await commandCallback(undefined);
    expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
      'No request specified for benchmarking.'
    );
    expect(mockOpenPanel).not.toHaveBeenCalled();
  });

  it('should return a disposable', () => {
    const result = registerBenchmarkCommand(mockOpenPanel);
    expect(result).toHaveProperty('dispose');
  });
});
