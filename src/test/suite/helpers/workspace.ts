import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

let counter = 0;

export async function createTestWorkspace(): Promise<string> {
  const dir = path.join(os.tmpdir(), `hivefetch-test-${Date.now()}-${counter++}`);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function cleanupTestWorkspace(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
