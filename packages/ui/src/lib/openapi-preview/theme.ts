export type OpenApiPreviewTheme = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

/**
 * VS Code stamps its active theme kind onto the webview body as a class. There
 * is no message-based theme plumbing in this codebase, so the preview reads the
 * class directly and maps both high-contrast kinds onto the nearest base theme.
 */
export function resolveTheme(theme: OpenApiPreviewTheme, body: HTMLElement): ResolvedTheme {
  if (theme !== 'auto') return theme;
  const classes = body.classList;
  if (classes.contains('vscode-high-contrast-light')) return 'light';
  if (classes.contains('vscode-high-contrast')) return 'dark';
  if (classes.contains('vscode-light')) return 'light';
  if (classes.contains('vscode-dark')) return 'dark';
  return 'light';
}

/**
 * Watches the body class so an open preview follows VS Code theme switches.
 * Returns a disposer.
 */
export function observeTheme(body: HTMLElement, onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(body, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
