import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import type { OutgoingMessage } from '@nouto/transport';
import { normalizeWsSession } from '@nouto/core/services';
import type { NotifyFn } from './types';

export interface WsSessionState {
  wsRecording: boolean;
  wsRecordedMessages: Array<{ direction: string; type: string; data: string; size: number; relativeTimeMs: number }>;
  wsRecordingStartTime: number;
  wsRecordingUrl: string;
  wsRecordingProtocols: string[];
  wsReplayTimers: ReturnType<typeof setTimeout>[];
  wsReplayCancelled: boolean;
}

export function createWsSessionState(): WsSessionState {
  return {
    wsRecording: false,
    wsRecordedMessages: [],
    wsRecordingStartTime: 0,
    wsRecordingUrl: '',
    wsRecordingProtocols: [],
    wsReplayTimers: [],
    wsReplayCancelled: false,
  };
}

export async function handleWsSessionMessage(
  message: OutgoingMessage,
  notify: NotifyFn,
  state: WsSessionState,
): Promise<void> {
  const data = 'data' in message ? (message as any).data : undefined;

  switch (message.type) {
    case 'wsStartRecording': {
      state.wsRecording = true;
      state.wsRecordedMessages = [];
      state.wsRecordingStartTime = Date.now();
      state.wsRecordingUrl = data?.url || '';
      state.wsRecordingProtocols = data?.protocols || [];
      notify({ type: 'wsRecordingState', data: { state: 'recording' } } as any);
      console.log('[TauriMessageBus] WebSocket recording started');
      break;
    }
    case 'wsStopRecording': {
      state.wsRecording = false;
      const duration = Date.now() - state.wsRecordingStartTime;
      const session = {
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
        name: data?.name || `Session ${new Date().toLocaleString()}`,
        createdAt: state.wsRecordingStartTime,
        config: {
          url: state.wsRecordingUrl,
          protocols: state.wsRecordingProtocols,
        },
        messages: [...state.wsRecordedMessages],
        durationMs: duration,
        messageCount: state.wsRecordedMessages.length,
        version: 1,
      };
      invoke('ws_save_session', { data: session }).catch((error) => {
        console.error('[TauriMessageBus] Failed to save session:', error);
      });
      notify({ type: 'wsRecordingState', data: { state: 'idle' } } as any);
      notify({ type: 'wsSessionSaved', data: { session } } as any);
      state.wsRecordedMessages = [];
      console.log('[TauriMessageBus] WebSocket recording stopped, session saved');
      break;
    }
    case 'wsSaveSession': {
      const sessionData = data?.session;
      if (!sessionData) break;
      invoke('ws_save_session', { data: sessionData }).catch((error) => {
        console.error('[TauriMessageBus] Failed to save session:', error);
      });
      break;
    }
    case 'wsExportSession': {
      const sessionData = data?.session;
      if (!sessionData) break;
      try {
        const json = JSON.stringify(sessionData, null, 2);
        const defaultName = `${(sessionData.name || 'ws-session').replace(/[^a-zA-Z0-9]/g, '_')}.json`;
        const filePath = await save({
          defaultPath: defaultName,
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (filePath) {
          await writeTextFile(filePath, json);
          notify({
            type: 'showNotification',
            data: { level: 'info', message: 'Session exported successfully.' },
          } as any);
        }
      } catch (error) {
        console.error('[TauriMessageBus] Session export failed:', error);
        notify({
          type: 'showNotification',
          data: { level: 'error', message: `Failed to export session: ${error}` },
        } as any);
      }
      break;
    }
    case 'wsLoadSession': {
      try {
        const filePath = await open({
          multiple: false,
          filters: [{ name: 'JSON Files', extensions: ['json'] }],
        });
        if (filePath) {
          const content = await readTextFile(filePath as string);
          const session = normalizeWsSession(JSON.parse(content));
          notify({
            type: 'wsSessionLoaded',
            data: { session },
          } as any);
        }
      } catch (error) {
        console.error('[TauriMessageBus] Session load failed:', error);
        notify({
          type: 'showNotification',
          data: { level: 'error', message: `Failed to load session: ${error}` },
        } as any);
      }
      break;
    }
    case 'wsStartReplay': {
      const session = data?.session ? normalizeWsSession(data.session) : null;
      const speed = data?.speedMultiplier || 1;
      if (!session?.messages?.length) break;

      state.wsReplayCancelled = false;
      state.wsReplayTimers = [];
      notify({ type: 'wsRecordingState', data: { state: 'replaying' } } as any);

      const sentMessages = session.messages.filter((m: any) => m.direction === 'sent');
      const total = sentMessages.length;

      if (total === 0) {
        notify({ type: 'wsRecordingState', data: { state: 'idle' } } as any);
        break;
      }

      sentMessages.forEach((msg: any, index: number) => {
        const delay = (msg.relativeTimeMs || 0) / speed;
        const timer = setTimeout(() => {
          if (state.wsReplayCancelled) return;

          invoke('ws_send', {
            data: {
              connectionId: data?.connectionId || 'default',
              message: msg.data,
              type: msg.type || 'text',
            },
          }).catch((error) => {
            console.error('[TauriMessageBus] Replay send failed:', error);
          });

          notify({
            type: 'wsReplayProgress',
            data: {
              index,
              total,
              state: 'replaying' as const,
            },
          } as any);

          if (index === total - 1) {
            notify({
              type: 'wsReplayProgress',
              data: { index: total, total, state: 'complete' as const },
            } as any);
            notify({ type: 'wsRecordingState', data: { state: 'idle' } } as any);
          }
        }, delay);
        state.wsReplayTimers.push(timer);
      });
      break;
    }
    case 'wsCancelReplay': {
      state.wsReplayCancelled = true;
      for (const timer of state.wsReplayTimers) {
        clearTimeout(timer);
      }
      state.wsReplayTimers = [];
      notify({ type: 'wsRecordingState', data: { state: 'idle' } } as any);
      notify({ type: 'wsReplayProgress', data: { index: 0, total: 0, state: 'complete' } } as any);
      console.log('[TauriMessageBus] WebSocket replay cancelled');
      break;
    }
  }
}
