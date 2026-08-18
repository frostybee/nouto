/**
 * Desktop-only actions the Settings page can call.
 *
 * `@nouto/ui` never imports Tauri APIs. The desktop app builds an object with
 * this shape (packages/desktop/src/settings-main.ts) and passes it to
 * SettingsPage as the `desktopHost` prop; VS Code passes nothing and the
 * Desktop section is not shown.
 */
export type DesktopActionResult = { ok: true } | { ok: false; message: string };

export interface DesktopHost {
  /** Current OS launch-at-login registration. */
  readAutostart(): Promise<boolean>;
  /** Flip the OS launch-at-login registration. */
  setAutostart(enabled: boolean): Promise<DesktopActionResult>;
  /**
   * Register an OS-wide hotkey (display format, e.g. "Ctrl+Shift+N"). On
   * failure the previous registration is left in place.
   */
  registerGlobalShortcut(accelerator: string): Promise<DesktopActionResult>;
  /** Release the current OS-wide hotkey, if any. */
  unregisterGlobalShortcut(): Promise<DesktopActionResult>;
  /** Show an OS notification regardless of focus, to let the user check the toggle works. */
  sendTestNotification(): Promise<DesktopActionResult>;
}
