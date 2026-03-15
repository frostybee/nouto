import type { WsRecordingState, WsSession, WsSessionSummary } from '../types';

// Recording state
const _recordingState = $state<{ value: WsRecordingState }>({ value: 'idle' });
const _currentSession = $state<{ value: WsSession | null }>({ value: null });
const _savedSessions = $state<{ value: WsSessionSummary[] }>({ value: [] });
const _replayProgress = $state<{ value: { index: number; total: number } | null }>({ value: null });
const _replaySpeed = $state<{ value: number }>({ value: 1 });

// Getters
export function recordingState(): WsRecordingState { return _recordingState.value; }
export function currentSession(): WsSession | null { return _currentSession.value; }
export function savedSessions(): WsSessionSummary[] { return _savedSessions.value; }
export function replayProgress(): { index: number; total: number } | null { return _replayProgress.value; }
export function replaySpeed(): number { return _replaySpeed.value; }

// Setters
export function setRecordingState(state: WsRecordingState): void {
  _recordingState.value = state;
}

export function setCurrentSession(session: WsSession | null): void {
  _currentSession.value = session;
}

export function setSavedSessions(sessions: WsSessionSummary[]): void {
  _savedSessions.value = sessions;
}

export function setReplayProgress(progress: { index: number; total: number } | null): void {
  _replayProgress.value = progress;
}

export function setReplaySpeed(speed: number): void {
  _replaySpeed.value = speed;
}
