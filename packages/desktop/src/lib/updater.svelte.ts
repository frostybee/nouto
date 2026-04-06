import { invoke } from '@tauri-apps/api/core';

let _updateAvailable = $state(false);
let _updateVersion = $state('');
let _updateBody = $state('');
let _downloading = $state(false);
let _downloadProgress = $state(0);
let _dismissed = $state(false);
let _installType = $state('');
let _updateSupported = $state(true);
let _preDownloaded = $state(false);
let _updateHandle: any = null;

export function updateAvailable() { return _updateAvailable; }
export function updateVersion() { return _updateVersion; }
export function updateBody() { return _updateBody; }
export function downloading() { return _downloading; }
export function downloadProgress() { return _downloadProgress; }
export function dismissed() { return _dismissed; }
export function installType() { return _installType; }
export function updateSupported() { return _updateSupported; }
export function preDownloaded() { return _preDownloaded; }

function makeProgressHandler() {
  let bytesReceived = 0;
  let totalBytes = 0;
  return (progress: any) => {
    if (progress.event === 'Started') {
      totalBytes = progress.data?.contentLength ?? 0;
      bytesReceived = 0;
      _downloadProgress = 0;
    } else if (progress.event === 'Progress') {
      bytesReceived += progress.data?.chunkLength ?? 0;
      _downloadProgress = totalBytes > 0
        ? Math.min(100, Math.round(bytesReceived / totalBytes * 100))
        : Math.min(99, _downloadProgress + 1);
    } else if (progress.event === 'Finished') {
      _downloadProgress = 100;
    }
  };
}

/** Check for updates via Tauri updater plugin. Call after app startup. */
export async function checkForUpdates(): Promise<void> {
  try {
    _updateSupported = await invoke<boolean>('is_update_supported');
    _installType = await invoke<string>('get_install_type');
    console.debug('[Nouto] Install type:', _installType);

    if (!_updateSupported) {
      console.debug('[Nouto] Auto-update not supported on this install type:', _installType);
      return;
    }

    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      _updateHandle = update;
      _updateVersion = update.version;
      _updateBody = update.body || '';
      _updateAvailable = true;

      // Start background pre-download silently so install is near-instant
      update.download(makeProgressHandler()).then(() => {
        _preDownloaded = true;
        console.debug('[Nouto] Update pre-downloaded:', _updateVersion);
      }).catch((err: unknown) => {
        console.debug('[Nouto] Background pre-download failed, will download on install:', err);
      });
    }
  } catch (err) {
    // Silently fail: updater may not be configured or network unavailable
    console.debug('[Nouto] Update check skipped:', err);
  }
}

/** Install the available update, then relaunch. */
export async function installUpdate(): Promise<void> {
  if (!_updateHandle) return;
  try {
    _downloading = true;
    _downloadProgress = _preDownloaded ? 100 : 0;

    if (_preDownloaded) {
      // Already downloaded in the background — install immediately
      await _updateHandle.install();
    } else {
      await _updateHandle.downloadAndInstall(makeProgressHandler());
    }

    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (err) {
    console.error('[Nouto] Update install failed:', err);
    _downloading = false;
  }
}

/** Dismiss the update banner for this session. */
export function dismissUpdate(): void {
  _dismissed = true;
}

/** Whether the update banner should be shown. */
export function showUpdateBanner(): boolean {
  return _updateAvailable && !_dismissed && !_downloading;
}
