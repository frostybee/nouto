// Frontend logger for the desktop app.
//
// In dev everything goes to the console with a level prefix. In production
// warn/error are forwarded to tauri-plugin-log so they land in the same log
// file as the Rust side; lower levels are dropped. Logging never throws.

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const CONSOLE_METHOD: Record<LogLevel, 'debug' | 'info' | 'warn' | 'error'> = {
  trace: 'debug',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

const IS_DEV = Boolean(import.meta.env?.DEV);

function formatArg(arg: unknown): string {
  if (arg instanceof Error) return arg.stack || `${arg.name}: ${arg.message}`;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function forwardToBackend(level: 'warn' | 'error', message: string, args: unknown[]): void {
  void (async () => {
    try {
      const { warn: logWarn, error: logError } = await import('@tauri-apps/plugin-log');
      const full = args.length > 0 ? `${message} ${args.map(formatArg).join(' ')}` : message;
      if (level === 'warn') await logWarn(full);
      else await logError(full);
    } catch {
      // Logging must never throw.
    }
  })();
}

function log(level: LogLevel, message: string, ...args: unknown[]): void {
  if (IS_DEV) {
    const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
    console[CONSOLE_METHOD[level]](prefix, message, ...args);
    return;
  }
  if (level === 'warn' || level === 'error') {
    forwardToBackend(level, message, args);
  }
}

export const logger = {
  trace: (message: string, ...args: unknown[]): void => log('trace', message, ...args),
  debug: (message: string, ...args: unknown[]): void => log('debug', message, ...args),
  info: (message: string, ...args: unknown[]): void => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]): void => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]): void => log('error', message, ...args),
};

export const { trace, debug, info, warn, error } = logger;
