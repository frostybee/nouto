import { describe, it, expect, vi } from 'vitest';
import { resolveTheme, observeTheme } from './theme';

function bodyWith(...classes: string[]): HTMLElement {
  const element = document.createElement('div');
  element.className = classes.join(' ');
  return element;
}

describe('resolveTheme', () => {
  it('passes explicit themes through untouched', () => {
    expect(resolveTheme('light', bodyWith('vscode-dark'))).toBe('light');
    expect(resolveTheme('dark', bodyWith('vscode-light'))).toBe('dark');
  });

  it('resolves auto from the VS Code body class', () => {
    expect(resolveTheme('auto', bodyWith('vscode-light'))).toBe('light');
    expect(resolveTheme('auto', bodyWith('vscode-dark'))).toBe('dark');
  });

  it('maps high contrast themes onto the nearest base theme', () => {
    expect(resolveTheme('auto', bodyWith('vscode-high-contrast'))).toBe('dark');
    expect(resolveTheme('auto', bodyWith('vscode-high-contrast-light'))).toBe('light');
  });

  it('prefers the high-contrast-light class over the high-contrast prefix', () => {
    // VS Code sets both classes for the light high-contrast theme.
    expect(resolveTheme('auto', bodyWith('vscode-high-contrast', 'vscode-high-contrast-light')))
      .toBe('light');
  });

  it('falls back to light when no theme class is present', () => {
    expect(resolveTheme('auto', bodyWith())).toBe('light');
  });
});

describe('observeTheme', () => {
  it('fires on body class changes and stops after disposal', async () => {
    const body = document.createElement('div');
    document.body.appendChild(body);
    const onChange = vi.fn();
    const stop = observeTheme(body, onChange);

    body.className = 'vscode-dark';
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).toHaveBeenCalled();

    stop();
    onChange.mockClear();
    body.className = 'vscode-light';
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onChange).not.toHaveBeenCalled();
  });
});
