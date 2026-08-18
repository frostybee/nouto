import type { OutgoingMessage } from '@nouto/transport';
import type { NotifyFn } from './types';
import { logger } from '../logger';

export async function handleCodegenMessage(
  message: OutgoingMessage,
  notify: NotifyFn,
): Promise<void> {
  if (message.type !== 'openInNewTab' || !message.data?.content) return;
  const { content } = message.data;

  try {
    await navigator.clipboard.writeText(content);
    notify({
      type: 'showNotification',
      data: { level: 'info', message: 'Code copied to clipboard.' },
    });
  } catch (error) {
    logger.error('[TauriMessageBus] Failed to copy code to clipboard:', error);
    notify({
      type: 'showNotification',
      data: { level: 'error', message: `Failed to copy code: ${error}` },
    });
  }
}
