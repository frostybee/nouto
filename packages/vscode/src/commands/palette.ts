import * as vscode from 'vscode';
import { CommandPaletteManager } from '../providers/CommandPaletteManager';

/**
 * Register the command palette command
 */
export function registerOpenCommandPaletteCommand(
  paletteManager: CommandPaletteManager
): vscode.Disposable {
  return vscode.commands.registerCommand('hivefetch.openCommandPalette', () => {
    paletteManager.show();
  });
}
