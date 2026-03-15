import type {
  WebSocketMessage,
  WebSocketMessageType,
  WsRecordingState,
  WsSession,
  WsSessionMessage,
} from '../types';

/**
 * Platform-agnostic WebSocket session recorder and replayer.
 * Works in both Node.js (VS Code extension) and browser (Tauri desktop) environments.
 *
 * State machine: idle -> recording -> idle, or idle -> replaying -> idle.
 */
export class WsSessionRecorder {
  // Callbacks
  onStateChange?: (state: WsRecordingState) => void;
  onReplayMessage?: (index: number, total: number) => void;
  onReplayComplete?: () => void;

  // State
  private state: WsRecordingState = 'idle';
  private startTime = 0;
  private messages: WsSessionMessage[] = [];
  private config: { url: string; protocols?: string[] } | null = null;
  private replayTimers: ReturnType<typeof setTimeout>[] = [];

  getState(): WsRecordingState {
    return this.state;
  }

  // --- Recording ---

  startRecording(config: { url: string; protocols?: string[] }): void {
    this.state = 'recording';
    this.config = config;
    this.startTime = Date.now();
    this.messages = [];
    this.onStateChange?.(this.state);
  }

  recordMessage(msg: WebSocketMessage): void {
    if (this.state !== 'recording') {
      return;
    }
    const sessionMsg: WsSessionMessage = {
      direction: msg.direction,
      type: msg.type,
      data: msg.data,
      size: msg.size,
      relativeTimeMs: Date.now() - this.startTime,
    };
    this.messages.push(sessionMsg);
  }

  stopRecording(name?: string): WsSession {
    const session: WsSession = {
      id: this.generateId(),
      name: name || `Session ${new Date().toISOString()}`,
      createdAt: Date.now(),
      config: this.config!,
      messages: [...this.messages],
      durationMs: Date.now() - this.startTime,
      messageCount: this.messages.length,
      version: 1,
    };

    this.state = 'idle';
    this.messages = [];
    this.config = null;
    this.onStateChange?.(this.state);

    return session;
  }

  // --- Replay ---

  startReplay(
    session: WsSession,
    sendFn: (data: string, type: WebSocketMessageType) => void,
    speedMultiplier: number = 1,
  ): void {
    this.state = 'replaying';
    this.onStateChange?.(this.state);

    const sentMessages = session.messages.filter((m) => m.direction === 'sent');
    const total = sentMessages.length;

    if (total === 0) {
      this.onReplayComplete?.();
      this.state = 'idle';
      this.onStateChange?.(this.state);
      return;
    }

    this.replayTimers = [];

    sentMessages.forEach((message, index) => {
      const delay = message.relativeTimeMs / speedMultiplier;
      const timer = setTimeout(() => {
        sendFn(message.data, message.type);
        this.onReplayMessage?.(index, total);

        if (index === total - 1) {
          this.onReplayComplete?.();
          this.state = 'idle';
          this.onStateChange?.(this.state);
        }
      }, delay);
      this.replayTimers.push(timer);
    });
  }

  cancelReplay(): void {
    this.replayTimers.forEach((timer) => clearTimeout(timer));
    this.replayTimers = [];
    this.state = 'idle';
    this.onStateChange?.(this.state);
  }

  // --- Helpers ---

  private generateId(): string {
    return `ws-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
