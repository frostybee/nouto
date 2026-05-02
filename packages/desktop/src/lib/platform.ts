import { type as osType } from '@tauri-apps/plugin-os';

let _platform: string | null = null;

export function getPlatform(): string {
  if (!_platform) {
    _platform = osType();
  }
  return _platform;
}

export function isMacOS(): boolean {
  return getPlatform() === 'macos';
}

export function isWindows(): boolean {
  return getPlatform() === 'windows';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}
