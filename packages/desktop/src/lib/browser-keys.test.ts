import { describe, expect, it } from 'vitest';
import { isSuppressedBrowserKey } from './browser-keys';

function key(init: KeyboardEventInit & { key: string }): KeyboardEvent {
  return new KeyboardEvent('keydown', init);
}

describe('isSuppressedBrowserKey', () => {
  it('suppresses Ctrl+F, Ctrl+G and Ctrl+P on windows', () => {
    expect(isSuppressedBrowserKey(key({ key: 'f', ctrlKey: true }), 'windows')).toBe(true);
    expect(isSuppressedBrowserKey(key({ key: 'G', ctrlKey: true, shiftKey: true }), 'windows')).toBe(true);
    expect(isSuppressedBrowserKey(key({ key: 'p', ctrlKey: true }), 'windows')).toBe(true);
  });

  it('suppresses F3 everywhere and F5 only when reload is enabled', () => {
    expect(isSuppressedBrowserKey(key({ key: 'F3' }), 'linux')).toBe(true);
    expect(isSuppressedBrowserKey(key({ key: 'F5' }), 'windows')).toBe(false);
    expect(isSuppressedBrowserKey(key({ key: 'F5' }), 'windows', { reload: true })).toBe(true);
  });

  it('uses Cmd on macOS and leaves bare Ctrl alone', () => {
    expect(isSuppressedBrowserKey(key({ key: 'f', metaKey: true }), 'macos')).toBe(true);
    expect(isSuppressedBrowserKey(key({ key: 'f', ctrlKey: true }), 'macos')).toBe(false);
    expect(isSuppressedBrowserKey(key({ key: 'f', metaKey: true }), 'windows')).toBe(false);
  });

  it('only suppresses reload when asked', () => {
    expect(isSuppressedBrowserKey(key({ key: 'r', ctrlKey: true }), 'windows')).toBe(false);
    expect(isSuppressedBrowserKey(key({ key: 'r', ctrlKey: true }), 'windows', { reload: true })).toBe(true);
    expect(isSuppressedBrowserKey(key({ key: 'R', ctrlKey: true, shiftKey: true }), 'windows', { reload: true })).toBe(true);
  });

  it('ignores combos with Alt or both modifiers, and app shortcuts', () => {
    expect(isSuppressedBrowserKey(key({ key: 'f', ctrlKey: true, altKey: true }), 'windows')).toBe(false);
    expect(isSuppressedBrowserKey(key({ key: 'f', ctrlKey: true, metaKey: true }), 'windows')).toBe(false);
    expect(isSuppressedBrowserKey(key({ key: 'w', ctrlKey: true }), 'windows')).toBe(false);
    expect(isSuppressedBrowserKey(key({ key: 'z', ctrlKey: true }), 'windows')).toBe(false);
  });
});
