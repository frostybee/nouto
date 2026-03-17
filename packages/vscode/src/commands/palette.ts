import * as vscode from 'vscode';
import { CommandPaletteManager } from '../providers/CommandPaletteManager';

/**
 * Register the search requests palette command
 */
export function registerOpenCommandPaletteCommand(
  paletteManager: CommandPaletteManager
): vscode.Disposable {
  return vscode.commands.registerCommand('nouto.openCommandPalette', () => {
    paletteManager.show();
  });
}
