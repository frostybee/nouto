let _updateAvailable = $state(false);
let _updateVersion = $state('');
let _updateBody = $state('');
let _downloading = $state(false);
let _downloadProgress = $state(0);
let _dismissed = $state(false);
let _updateHandle: any = null;

export function updateAvailable() { return _updateAvailable; }
export function updateVersion() { return _updateVersion; }
export function updateBody() { return _updateBody; }
export function downloading() { return _downloading; }
export function downloadProgress() { return _downloadProgress; }
export function dismissed() { return _dismissed; }

/** Check for updates via Tauri updater plugin. Call after app startup. */
export async function checkForUpdates(): Promise<void> {
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (update) {
      _updateHandle = update;
      _updateVersion = update.version;
      _updateBody = update.body || '';
      _updateAvailable = true;
    }
  } catch (err) {
    // Silently fail: updater may not be configured or network unavailable
    console.debug('[Nouto] Update check skipped:', err);
  }
}

/** Download and install the available update, then relaunch. */
export async function installUpdate(): Promise<void> {
  if (!_updateHandle) return;
  try {
    _downloading = true;
    _downloadProgress = 0;

    await _updateHandle.downloadAndInstall((progress: any) => {
      if (progress.event === 'Started' && progress.data?.contentLength) {
        _downloadProgress = 0;
      } else if (progress.event === 'Progress') {
        _downloadProgress = Math.min(100, _downloadProgress + (progress.data?.chunkLength || 0) / 100);
      } else if (progress.event === 'Finished') {
        _downloadProgress = 100;
      }
    });

    // Relaunch after install
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
