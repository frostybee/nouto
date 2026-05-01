import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { OutgoingMessage } from '@nouto/transport';
import { RunnerExportService } from '@nouto/core/services';
import type { RunnerExportFormat } from '@nouto/core/services';
import type { NotifyFn } from './types';

export async function handleRunnerMessage(message: OutgoingMessage, notify: NotifyFn): Promise<void> {
  const data = 'data' in message ? (message as any).data : undefined;

  switch (message.type) {
    case 'retryFailedRequests': {
      const config = data?.config || {};
      invoke('start_collection_run', {
        data: {
          collectionId: config.collectionId || '',
          folderId: config.folderId,
          config,
          requestIds: data?.requestIds || [],
          environmentId: data?.environmentId,
        },
      }).catch((error) => {
        console.error('[TauriMessageBus] retryFailedRequests failed:', error);
        notify({ type: 'showNotification', data: { level: 'error', message: `Retry failed: ${error}` } } as any);
      });
      break;
    }
    case 'exportRunResults': {
      const { format, results, summary, collectionName } = data || {};
      const fmt = (format || 'json') as RunnerExportFormat;
      const exportService = new RunnerExportService();
      const content = exportService.format(fmt, { collectionName: collectionName || 'results', results: results || [], summary: summary || { passed: 0, failed: 0, skipped: 0, totalDuration: 0 } });
      const defaultName = exportService.getDefaultFileName(fmt, collectionName || 'results');
      const filter = exportService.getFileFilter(fmt);

      try {
        const filePath = await save({
          defaultPath: defaultName,
          filters: [filter],
        });
        if (filePath) {
          await writeTextFile(filePath, content);
          notify({ type: 'showNotification', data: { level: 'info', message: 'Results exported successfully.' } } as any);
        }
      } catch (error) {
        console.error('[TauriMessageBus] Export failed:', error);
        notify({ type: 'showNotification', data: { level: 'error', message: `Failed to export results: ${error}` } } as any);
      }
      break;
    }
  }
}
