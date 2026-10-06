/**
 * Hosts the real VS Code request panel (src/main.ts) in a plain browser for
 * scripted GIF and screenshot recordings. Only the extension host is faked;
 * the entry point, components, and styles are the production ones.
 *
 * URL parameters: ?scene=<name> picks the fixture, ?cursor=1 draws a pointer.
 */
import { createFakeHost, type Scene } from './fakeHost';
import { installFakeCursor } from './cursor';
import users from './fixtures/jsonplaceholder-users.json';

interface ThemeDump {
  bodyClass?: string;
  dataset?: Record<string, string>;
  defaultStyles?: string;
  vars?: Record<string, string>;
}

const scenes: Record<string, Scene> = {
  'send-request': {
    responseDelayMs: 450,
    response: {
      status: 200,
      statusText: 'OK',
      duration: 142,
      httpVersion: '2.0',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'max-age=43200',
        'access-control-allow-credentials': 'true',
        etag: 'W/"160d-1eMSsxeJRfnVLRBmYJSbCiJZ1qQ"',
        expires: '-1',
        pragma: 'no-cache',
        vary: 'Origin, Accept-Encoding',
        'x-content-type-options': 'nosniff',
        'x-powered-by': 'Express',
        server: 'cloudflare',
      },
      body: users,
    },
  },
};

/** Applies a dump of a real VS Code webview's theme (see tests/media/README.md). */
function applyTheme(): void {
  const dumps = import.meta.glob<{ default: ThemeDump }>('./themes/*.json', { eager: true });
  const theme = dumps['./themes/vscode.json']?.default;
  const root = document.documentElement;
  if (!theme) {
    console.warn('[media] tests/media/themes/vscode.json not found; using Nouto fallback colors.');
    document.body.classList.add('vscode-dark');
    document.body.dataset.vscodeThemeKind = 'vscode-dark';
  } else {
    for (const [name, value] of Object.entries(theme.vars ?? {})) root.style.setProperty(name, value);
    if (theme.bodyClass) document.body.className = theme.bodyClass;
    Object.assign(document.body.dataset, theme.dataset ?? {});
    if (theme.defaultStyles) {
      const style = document.createElement('style');
      style.id = '_defaultStyles';
      style.textContent = theme.defaultStyles;
      document.head.prepend(style);
    }
  }
  // VS Code paints the editor background behind the webview
  root.style.background = 'var(--vscode-editor-background, #1e1e1e)';
  root.style.height = '100%';
  document.body.style.height = '100%';
}

const params = new URLSearchParams(location.search);
const scene = scenes[params.get('scene') ?? 'send-request'];
if (!scene) throw new Error(`Unknown scene: ${params.get('scene')}`);

applyTheme();
// Recordings show an experienced user, so skip the onboarding tips
localStorage.setItem('nouto_onboarding', JSON.stringify({ hasCompletedOnboarding: true, dismissedHints: [] }));
const host = createFakeHost(scene);
(window as any).vscode = {
  postMessage: (message: any) => host.receive(message),
  getState: () => undefined,
  setState: () => {},
};
if (params.get('cursor') === '1') installFakeCursor();

await import('../../src/main');
