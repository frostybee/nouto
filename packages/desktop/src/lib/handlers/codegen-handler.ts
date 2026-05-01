import type { OutgoingMessage } from '@nouto/transport';
import type { NotifyFn } from './types';

export async function handleCodegenMessage(message: OutgoingMessage, notify: NotifyFn): Promise<void> {
  const data = 'data' in message ? (message as any).data : undefined;

  if (message.type === 'openInNewTab' && data?.content) {
    try {
      await navigator.clipboard.writeText(data.content);
      notify({
        type: 'showNotification',
        data: { level: 'info', message: 'Code copied to clipboard.' },
      } as any);
    } catch (error) {
      console.error('[TauriMessageBus] Failed to copy code to clipboard:', error);
      notify({
        type: 'showNotification',
        data: { level: 'error', message: `Failed to copy code: ${error}` },
      } as any);
    }
  }
}
