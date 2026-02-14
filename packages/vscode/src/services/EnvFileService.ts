import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import type { EnvironmentVariable } from './types';

/**
 * Service for parsing and watching .env files.
 * Provides variables that integrate into the environment variable chain.
 */
export class EnvFileService implements vscode.Disposable {
  private _filePath: string | null = null;
  private _variables: EnvironmentVariable[] = [];
  private _watcher: vscode.FileSystemWatcher | null = null;

  private readonly _onDidChange = new vscode.EventEmitter<EnvironmentVariable[]>();
  public readonly onDidChange = this._onDidChange.event;

  /**
   * Set the .env file path. Pass null to unlink.
   */
  async setFilePath(filePath: string | null): Promise<void> {
    // Clean up old watcher
    this._watcher?.dispose();
    this._watcher = null;

    this._filePath = filePath;

    if (!filePath) {
      this._variables = [];
      this._onDidChange.fire(this._variables);
      return;
    }

    // Parse the file
    await this._parseFile();

    // Set up file watcher
    const pattern = new vscode.RelativePattern(vscode.Uri.file(filePath), '');
    this._watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        vscode.Uri.joinPath(vscode.Uri.file(filePath), '..'),
        vscode.Uri.file(filePath).path.split('/').pop()!
      )
    );

    this._watcher.onDidChange(async () => {
      await this._parseFile();
      this._onDidChange.fire(this._variables);
    });

    this._watcher.onDidDelete(() => {
      this._variables = [];
      this._onDidChange.fire(this._variables);
    });

    this._watcher.onDidCreate(async () => {
      await this._parseFile();
      this._onDidChange.fire(this._variables);
    });
  }

  getVariables(): EnvironmentVariable[] {
    return this._variables;
  }

  getFilePath(): string | null {
    return this._filePath;
  }

  private async _parseFile(): Promise<void> {
    if (!this._filePath) {
      this._variables = [];
      return;
    }

    try {
      const content = await fs.readFile(this._filePath, 'utf8');
      this._variables = parseEnvContent(content);
    } catch {
      this._variables = [];
    }
  }

  dispose(): void {
    this._watcher?.dispose();
    this._onDidChange.dispose();
  }
}

/**
 * Parse .env file content into environment variables.
 * Handles:
 * - KEY=VALUE format
 * - # comments and empty lines
 * - Single and double quoted values
 * - Escape sequences in double-quoted values (\n, \t, \")
 * - Inline # comments for unquoted values
 */
export function parseEnvContent(content: string): EnvironmentVariable[] {
  const variables: EnvironmentVariable[] = [];
  const lines = content.split(/\r?\n/);
  const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    // Match KEY=VALUE
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    if (!keyPattern.test(key)) continue;

    let rawValue = trimmed.substring(eqIndex + 1).trim();

    let value: string;
    if (rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2) {
      // Double-quoted: handle escapes
      value = rawValue
        .slice(1, -1)
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    } else if (rawValue.startsWith("'") && rawValue.endsWith("'") && rawValue.length >= 2) {
      // Single-quoted: literal value
      value = rawValue.slice(1, -1);
    } else {
      // Unquoted: strip inline comments
      const commentIndex = rawValue.indexOf(' #');
      if (commentIndex !== -1) {
        rawValue = rawValue.substring(0, commentIndex);
      }
      value = rawValue.trim();
    }

    variables.push({ key, value, enabled: true });
  }

  return variables;
}
