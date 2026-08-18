// Keys the webview answers itself, drawn over the app as browser chrome.
//
// On Windows, Ctrl+F pops WebView2's find bar into the top-right corner and
// Ctrl+P opens a print dialog. The webview setting that would turn these off
// wholesale is not reachable through Tauri, so the page cancels them instead.
// This works because Chromium treats these as page-cancellable, unlike truly
// reserved combos (Ctrl+T, Ctrl+W, Ctrl+N) a webview never receives anyway.

const SUPPRESSED_KEYS = new Set([
  'f', // find bar
  'g', // find next / previous (with Shift)
  'p', // print
]);

export interface BrowserKeyOptions {
  /**
   * Also swallow reload (Ctrl+R / Cmd+R / F5 and their hard-reload variants).
   * Reload is the one webview default with a legitimate development use; in a
   * shipped single-page app it throws away every store and whatever the user
   * had in flight.
   */
  reload?: boolean;
}

/**
 * Whether this keypress is browser chrome the app should swallow.
 *
 * Only the platform's own primary modifier counts: on macOS the find bar is
 * Cmd+F, and matching bare Ctrl+F there would break the Emacs-style cursor
 * bindings macOS text fields provide.
 *
 * Shift is deliberately not excluded (Ctrl+Shift+G is find-previous). Matching
 * a combo an app command also owns is harmless: suppression only calls
 * `preventDefault()`, so the app's own keydown handlers still run.
 */
export function isSuppressedBrowserKey(
  event: KeyboardEvent,
  platform: string,
  options: BrowserKeyOptions = {},
): boolean {
  // Find-next on Windows and Linux carries no modifier.
  if (event.key === 'F3') return true;
  // Neither does reload, in either its plain or its hard (Ctrl/Shift) form.
  if (event.key === 'F5') return options.reload === true;

  const isMac = platform === 'macos';
  const primary = isMac ? event.metaKey : event.ctrlKey;
  const secondary = isMac ? event.ctrlKey : event.metaKey;
  if (!primary || secondary || event.altKey) return false;

  const key = event.key.toLowerCase();
  if (key === 'r') return options.reload === true;
  return SUPPRESSED_KEYS.has(key);
}

/**
 * Installs the suppressor on `window` and returns its teardown.
 *
 * Listens in the capture phase so the browser default is cancelled before any
 * component handler can call `stopPropagation()` and strand it.
 */
export function initBrowserKeySuppression(
  platform: string,
  options: BrowserKeyOptions = {},
): () => void {
  const handler = (event: KeyboardEvent): void => {
    if (isSuppressedBrowserKey(event, platform, options)) event.preventDefault();
  };
  window.addEventListener('keydown', handler, { capture: true });
  return () => {
    window.removeEventListener('keydown', handler, { capture: true });
  };
}
