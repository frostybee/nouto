import type { OutgoingMessage } from '@nouto/transport/messages';

/**
 * Resolve file contents for the given paths by sending readFileContent messages
 * through the message bus and collecting the responses.
 *
 * Works on both VS Code (extension host reads via workspace.fs) and
 * Desktop (TauriMessageBus reads via @tauri-apps/plugin-fs).
 *
 * Skips paths that fail to read (logs a warning, continues).
 * Times out after 10 seconds.
 */
export function resolveFilePaths(
  paths: string[],
  messageBus: (msg: OutgoingMessage) => void,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return Promise.resolve(result);

  return new Promise<Map<string, string>>((resolve) => {
    let remaining = paths.length;

    function checkDone() {
      remaining--;
      if (remaining <= 0) resolve(result);
    }

    // Listen for responses on the window message event (VS Code webview pattern)
    function handleMessage(event: MessageEvent) {
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'fileContentRead') {
        const { path, content } = msg.data;
        if (paths.includes(path)) {
          result.set(path, content);
          checkDone();
        }
      } else if (msg.type === 'fileContentError') {
        const { path, error } = msg.data;
        if (paths.includes(path)) {
          console.warn(`$file.read: could not read ${path}: ${error}`);
          checkDone();
        }
      }
    }

    window.addEventListener('message', handleMessage);

    // Send read requests for all paths
    for (const path of paths) {
      messageBus({ type: 'readFileContent', data: { path } } as any);
    }

    // Safety timeout
    setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      resolve(result);
    }, 10_000);
  });
}
