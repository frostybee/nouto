export interface DiagnosticsReport {
  appName: string;
  appVersion: string;
  osName: string;
  osArch: string;
  osVersion: string;
  tauriVersion: string;
  settings: Record<string, unknown>;
  recentCrashReports: string[];
  memoryUsageBytes: number | null;
  uptimeSecs: number | null;
}

export function formatDiagnostics(report: DiagnosticsReport): string {
  const lines = [
    '=== Diagnostics Report ===',
    '',
    `App: ${report.appName} ${report.appVersion}`,
    `OS: ${report.osName} ${report.osArch}`,
    `OS Version: ${report.osVersion}`,
    `Tauri: ${report.tauriVersion}`,
  ];

  if (report.uptimeSecs != null) {
    const h = Math.floor(report.uptimeSecs / 3600);
    const m = Math.floor((report.uptimeSecs % 3600) / 60);
    const s = report.uptimeSecs % 60;
    lines.push(`Uptime: ${h}h ${m}m ${s}s`);
  }

  if (report.memoryUsageBytes != null) {
    const mb = (report.memoryUsageBytes / (1024 * 1024)).toFixed(1);
    lines.push(`Memory: ${mb} MB`);
  }

  lines.push('', '--- Settings ---', JSON.stringify(report.settings, null, 2));

  if (report.recentCrashReports.length > 0) {
    lines.push('', '--- Recent Crash Reports ---', ...report.recentCrashReports);
  }

  return lines.join('\n');
}
