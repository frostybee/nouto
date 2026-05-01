import type { OutgoingMessage } from '@nouto/transport';
import type { NotifyFn } from './types';

const COLLECTIONS_KEY = 'nouto_collections';

export function handleCollectionMessage(message: OutgoingMessage, notify: NotifyFn): void {
  switch (message.type) {
    case 'getCollections': {
      try {
        const raw = localStorage.getItem(COLLECTIONS_KEY);
        const collections = raw ? JSON.parse(raw) : [];
        notify({ type: 'collections', data: collections } as any);
      } catch (error) {
        console.error('[TauriMessageBus] Failed to load collections:', error);
        notify({ type: 'collections', data: [] } as any);
      }
      break;
    }
  }
}
