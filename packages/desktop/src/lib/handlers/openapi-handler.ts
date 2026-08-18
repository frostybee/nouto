import type { OutgoingMessage } from '@nouto/transport';
import type { NotifyFn } from './types';
import { openFile, saveDocument, saveDocumentAs } from '../openapi/documentAdapter';

/**
 * Routes the OpenAPI document-lifecycle messages to the local document
 * adapter. Phase 1's own toolbar calls the adapter directly; this path exists
 * for message-driven callers (the Phase 3 preview adapter emits these types).
 */
export async function handleOpenApiMessage(
  message: OutgoingMessage,
  _notify: NotifyFn,
): Promise<void> {
  if (message.type === 'openApiSave') {
    await saveDocument();
  } else if (message.type === 'openApiSaveAs') {
    await saveDocumentAs();
  } else if (message.type === 'openApiOpenFile') {
    await openFile();
  }
}
