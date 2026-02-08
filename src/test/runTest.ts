import * as path from 'path';
import * as cp from 'child_process';
import { downloadAndUnzipVSCode, resolveCliPathFromVSCodeExecutablePath } from '@vscode/test-electron';

async function main() {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Download VS Code
    const vscodeExecutablePath = await downloadAndUnzipVSCode();

    // On Windows, resolve to the CLI script (bin/code.cmd) which handles
    // argument passing correctly, unlike the raw Electron binary (Code.exe)
    const cliPath = process.platform === 'win32'
      ? resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath)
      : vscodeExecutablePath;

    const args = [
      '--extensionDevelopmentPath=' + extensionDevelopmentPath,
      '--extensionTestsPath=' + extensionTestsPath,
      '--disable-extensions',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-gpu-sandbox',
      '--disable-updates',
      '--skip-welcome',
      '--skip-release-notes',
      '--disable-workspace-trust',
    ];

    const defaultCachePath = path.resolve(path.dirname(vscodeExecutablePath), '..');
    args.push(`--extensions-dir=${path.join(defaultCachePath, 'extensions')}`);
    args.push(`--user-data-dir=${path.join(defaultCachePath, 'user-data')}`);

    const shell = process.platform === 'win32';
    const child = cp.spawn(
      shell ? `"${cliPath}"` : cliPath,
      args,
      {
        env: process.env,
        shell,
        stdio: 'inherit',
      },
    );

    await new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Test run failed with code ${code}`));
        } else {
          resolve();
        }
      });
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
