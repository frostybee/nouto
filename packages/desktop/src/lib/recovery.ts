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

/** Write a frontend error report to the crash-reports directory. Never throws. */
export function logFrontendError(error: unknown): void {
  void invoke('log_frontend_error', {
    message: describeError(error),
    stack: error instanceof Error ? (error.stack ?? null) : null,
    componentStack: null,
  }).catch(() => {});
}

let lastGlobalCapture = 0;

export function captureGlobalError(error: unknown, source: string): void {
  const now = Date.now();
  if (now - lastGlobalCapture < 5000) return;
  lastGlobalCapture = now;
  logger.error(`Uncaught ${source}`, error);
  void saveEmergencyData(`crash-${source}-${now}`, error);
  logFrontendError(error);
}

export interface CrashReportSummary {
  filename: string;
  timestampSecs: number;
  secondsAgo: number;
}

/**
 * The most recent crash report if it is less than a few minutes old, with its
 * text; null otherwise. Best-effort: any failure reads as "no recent crash".
 */
export async function checkForRecentCrash(): Promise<{
  summary: CrashReportSummary;
  report: string;
} | null> {
  try {
    const summary = await invoke<CrashReportSummary | null>('has_recent_crash');
    if (!summary) return null;
    const report = await invoke<string>('get_crash_report', { name: summary.filename });
    return { summary, report };
  } catch {
    return null;
  }
}
