import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile, writeFile } from '@tauri-apps/plugin-fs';
import { tempDir } from '@tauri-apps/api/path';
import { open as shellOpen } from '@tauri-apps/plugin-shell';
import type { OutgoingMessage } from '@nouto/transport';
import type { NotifyFn } from './types';

export async function handleFileOperation(message: OutgoingMessage, notify: NotifyFn): Promise<void> {
  const data = 'data' in message ? (message as any).data : undefined;

  try {
    if (message.type === 'downloadResponse') {
      const content = data?.content ?? '';
      const defaultName = data?.filename || 'response.txt';
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });
      if (filePath) {
        await writeTextFile(filePath, content);
        notify({ type: 'showNotification', data: { level: 'info', message: 'Response saved to file.' } } as any);
      }
    } else if (message.type === 'downloadBinaryResponse') {
      const base64Content = data?.base64 ?? '';
      const defaultName = data?.filename || 'response.bin';
      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: 'All Files', extensions: ['*'] }],
      });
      if (filePath) {
        const binaryStr = atob(base64Content);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        await writeFile(filePath, bytes);
        notify({ type: 'showNotification', data: { level: 'info', message: 'Response saved to file.' } } as any);
      }
    } else if (message.type === 'openBinaryResponse') {
      const base64Content = data?.base64 ?? '';
      const filename = data?.filename || 'response.bin';
      const tmpDir = await tempDir();
      const tmpPath = `${tmpDir.endsWith('/') || tmpDir.endsWith('\\') ? tmpDir : tmpDir + '/'}${filename}`;
      const binaryStr = atob(base64Content);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      await writeFile(tmpPath, bytes);
      await shellOpen(tmpPath);
    }
  } catch (error) {
    console.error('[TauriMessageBus] File operation failed:', error);
    notify({ type: 'showNotification', data: { level: 'error', message: `Failed to save file: ${error}` } } as any);
  }
}
