import { invoke } from '@tauri-apps/api/core';
import { logger } from './logger';

export function describeError(error: unknown): string {
  return error instanceof Error
    ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
    : String(error);
}

export async function saveEmergencyData(filename: string, error: unknown): Promise<void> {
  try {
    await invoke('save_emergency_data', {
      filename,
      data: { message: describeError(error), timestamp: new Date().toISOString() },
    });
  } catch (err) {
    logger.error('Failed to save emergency crash data', err);
  }
}

let lastGlobalCapture = 0;

export function captureGlobalError(error: unknown, source: string): void {
  const now = Date.now();
  if (now - lastGlobalCapture < 5000) return;
  lastGlobalCapture = now;
  logger.error(`Uncaught ${source}`, error);
  void saveEmergencyData(`crash-${source}-${now}`, error);
}
