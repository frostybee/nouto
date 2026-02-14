import * as vscode from 'vscode';

/**
 * Show a VS Code modal warning dialog for destructive action confirmation.
 * Returns true if the user confirmed, false otherwise.
 */
export async function confirmAction(message: string, confirmLabel: string): Promise<boolean> {
  const result = await vscode.window.showWarningMessage(
    message,
    { modal: true },
    confirmLabel
  );

  return result === confirmLabel;
}
