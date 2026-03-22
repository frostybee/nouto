/**
 * Theme store for the Nouto desktop app.
 * Manages theme selection, persistence, and system theme detection.
 * Svelte 5 runes only.
 */

let _currentTheme = $state<string>('system');

export function currentTheme(): string {
  return _currentTheme;
}

export function setTheme(themeId: string): void {
  _currentTheme = themeId;
  applyTheme(themeId);
  localStorage.setItem('nouto_theme', themeId);
}

export function initTheme(): void {
  const saved = localStorage.getItem('nouto_theme') || 'system';
  _currentTheme = saved;
  applyTheme(saved);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (_currentTheme === 'system') applyTheme('system');
  });
}

function applyTheme(themeId: string): void {
  const resolved = themeId === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : themeId;
  document.documentElement.setAttribute('data-theme', resolved);
}

export interface ThemeDefinition {
  id: string;
  name: string;
  category: 'auto' | 'dark' | 'light';
  colors: {
    background: string;
    foreground: string;
    accent: string;
    sidebar: string;
    button: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  { id: 'system', name: 'System (Auto)', category: 'auto', colors: { background: '#1e1e1e', foreground: '#cccccc', accent: '#007acc', sidebar: '#252526', button: '#0e639c' } },
  { id: 'dark', name: 'Dark', category: 'dark', colors: { background: '#1e1e1e', foreground: '#cccccc', accent: '#007acc', sidebar: '#252526', button: '#0e639c' } },
  { id: 'light', name: 'Light', category: 'light', colors: { background: '#ffffff', foreground: '#333333', accent: '#0066b8', sidebar: '#f3f3f3', button: '#0066b8' } },
  { id: 'nord', name: 'Nord', category: 'dark', colors: { background: '#2e3440', foreground: '#d8dee9', accent: '#88c0d0', sidebar: '#2e3440', button: '#5e81ac' } },
  { id: 'dracula', name: 'Dracula', category: 'dark', colors: { background: '#282a36', foreground: '#f8f8f2', accent: '#bd93f9', sidebar: '#21222c', button: '#6272a4' } },
  { id: 'solarized-dark', name: 'Solarized Dark', category: 'dark', colors: { background: '#002b36', foreground: '#839496', accent: '#268bd2', sidebar: '#002b36', button: '#268bd2' } },
  { id: 'solarized-light', name: 'Solarized Light', category: 'light', colors: { background: '#fdf6e3', foreground: '#657b83', accent: '#268bd2', sidebar: '#eee8d5', button: '#268bd2' } },
  { id: 'monokai', name: 'Monokai', category: 'dark', colors: { background: '#272822', foreground: '#f8f8f2', accent: '#66d9ef', sidebar: '#1e1f1c', button: '#75715e' } },
  { id: 'github-dark', name: 'GitHub Dark', category: 'dark', colors: { background: '#0d1117', foreground: '#c9d1d9', accent: '#58a6ff', sidebar: '#161b22', button: '#238636' } },
  { id: 'github-light', name: 'GitHub Light', category: 'light', colors: { background: '#ffffff', foreground: '#24292f', accent: '#0969da', sidebar: '#f6f8fa', button: '#2da44e' } },
  { id: 'one-dark-pro', name: 'One Dark Pro', category: 'dark', colors: { background: '#282c34', foreground: '#abb2bf', accent: '#61afef', sidebar: '#21252b', button: '#404754' } },
];
