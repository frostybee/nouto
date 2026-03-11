import * as vscode from 'vscode';
import { confirmAction } from './confirmAction';

describe('confirmAction', () => {
  const mockShowWarningMessage = vscode.window.showWarningMessage as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return true when user clicks the confirm button', async () => {
    mockShowWarningMessage.mockResolvedValue('Delete');
    const result = await confirmAction('Are you sure?', 'Delete');
    expect(result).toBe(true);
    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      'Are you sure?',
      { modal: true },
      'Delete'
    );
  });

  it('should return false when user cancels the dialog', async () => {
    mockShowWarningMessage.mockResolvedValue(undefined);
    const result = await confirmAction('Are you sure?', 'Delete');
    expect(result).toBe(false);
  });

  it('should return false when user clicks a different button', async () => {
    mockShowWarningMessage.mockResolvedValue('Cancel');
    const result = await confirmAction('Are you sure?', 'Delete');
    expect(result).toBe(false);
  });

  it('should pass correct message and label', async () => {
    mockShowWarningMessage.mockResolvedValue('Confirm');
    await confirmAction('Delete all items?', 'Confirm');
    expect(mockShowWarningMessage).toHaveBeenCalledWith(
      'Delete all items?',
      { modal: true },
      'Confirm'
    );
  });
});
