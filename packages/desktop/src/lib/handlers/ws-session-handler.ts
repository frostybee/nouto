import { invoke } from '@tauri-apps/api/core';
import { save, open } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import type { OutgoingMessage } from '@nouto/transport';
import type { WsSession, WsSessionMessage } from '@nouto/core';
import { normalizeWsSession } from '@nouto/core/services';
import type { NotifyFn } from './types';
import { logger } from '../logger';

export type WsSessionCommandMessage = Extract<
  OutgoingMessage,
  {
    type:
      | 'wsStartRecording'
      | 'wsStopRecording'
      | 'wsSaveSession'
      | 'wsExportSession'
      | 'wsLoadSession'
      | 'wsStartReplay'
      | 'wsCancelReplay';
  }
>;

const WS_SESSION_COMMAND_TYPES: ReadonlySet<string> = new Set([
  'wsStartRecording',
  'wsStopRecording',
  'wsSaveSession',
  'wsExportSession',
  'wsLoadSession',
  'wsStartReplay',
  'wsCancelReplay',
]);

export function isWsSessionCommand(message: OutgoingMessage): message is WsSessionCommandMessage {
  return WS_SESSION_COMMAND_TYPES.has(message.type);
}

export interface WsSessionState {
  wsRecording: boolean;
  wsRecordedMessages: WsSessionMessage[];
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
  message: WsSessionCommandMessage,
  notify: NotifyFn,
  state: WsSessionState,
): Promise<void> {
  switch (message.type) {
    case 'wsStartRecording': {
      const data = message.data;
      state.wsRecording = true;
      state.wsRecordedMessages = [];
      state.wsRecordingStartTime = Date.now();
      state.wsRecordingUrl = data?.url || '';
      state.wsRecordingProtocols = data?.protocols || [];
      notify({ type: 'wsRecordingState', data: { state: 'recording' } });
      logger.info('[TauriMessageBus] WebSocket recording started');
      break;
    }
    case 'wsStopRecording': {
      const data = message.data;
      state.wsRecording = false;
      const duration = Date.now() - state.wsRecordingStartTime;
      const session: WsSession = {
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
        logger.error('[TauriMessageBus] Failed to save session:', error);
      });
      notify({ type: 'wsRecordingState', data: { state: 'idle' } });
      notify({ type: 'wsSessionSaved', data: { session } });
      state.wsRecordedMessages = [];
      logger.info('[TauriMessageBus] WebSocket recording stopped, session saved');
      break;
    }
    case 'wsSaveSession': {
      const sessionData = message.data.session;
      if (!sessionData) break;
      invoke('ws_save_session', { data: sessionData }).catch((error) => {
        logger.error('[TauriMessageBus] Failed to save session:', error);
      });
      break;
    }
    case 'wsExportSession': {
      const sessionData = message.data.session;
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
          });
        }
      } catch (error) {
        logger.error('[TauriMessageBus] Session export failed:', error);
        notify({
          type: 'showNotification',
          data: { level: 'error', message: `Failed to export session: ${error}` },
        });
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
          });
        }
      } catch (error) {
        logger.error('[TauriMessageBus] Session load failed:', error);
        notify({
          type: 'showNotification',
          data: { level: 'error', message: `Failed to load session: ${error}` },
        });
      }
      break;
    }
    case 'wsStartReplay': {
      const data = message.data;
      const session = data?.session ? normalizeWsSession(data.session) : null;
      const speed = data?.speedMultiplier || 1;
      if (!session?.messages?.length) break;

      state.wsReplayCancelled = false;
      state.wsReplayTimers = [];
      notify({ type: 'wsRecordingState', data: { state: 'replaying' } });

      const sentMessages = session.messages.filter((m) => m.direction === 'sent');
      const total = sentMessages.length;

      if (total === 0) {
        notify({ type: 'wsRecordingState', data: { state: 'idle' } });
        break;
      }

      sentMessages.forEach((msg, index) => {
        const delay = (msg.relativeTimeMs || 0) / speed;
        const timer = setTimeout(() => {
          if (state.wsReplayCancelled) return;

          invoke('ws_send', {
            data: {
              connectionId: 'default',
              message: msg.data,
              type: msg.type || 'text',
            },
          }).catch((error) => {
            logger.error('[TauriMessageBus] Replay send failed:', error);
          });

          notify({
            type: 'wsReplayProgress',
            data: {
              index,
              total,
              state: 'replaying' as const,
            },
          });

          if (index === total - 1) {
            notify({
              type: 'wsReplayProgress',
              data: { index: total, total, state: 'complete' as const },
            });
            notify({ type: 'wsRecordingState', data: { state: 'idle' } });
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
      notify({ type: 'wsRecordingState', data: { state: 'idle' } });
      notify({
        type: 'wsReplayProgress',
        data: { index: 0, total: 0, state: 'complete' as const },
      });
      logger.info('[TauriMessageBus] WebSocket replay cancelled');
      break;
    }
  }
}
