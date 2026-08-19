import { describe, it, expect } from 'vitest';
import { TOKEN_NAMES } from './engine';
import { deriveTokensForPreset, mergeImportedPreset, presetContentEquals } from './presets';
import type { ThemePreset } from './schema';

const base: ThemePreset = {
  id: 'nord',
  name: 'Nord',
  mode: 'dark',
  accent: '#88c0d0',
  background: '#2e3440',
  foreground: '#d8dee9',
  contrast: 50,
};

describe('deriveTokensForPreset', () => {
  it('emits every token and applies overrides verbatim', () => {
    const tokens = deriveTokensForPreset({ ...base, overrides: { border: '#123456' } });
    for (const name of TOKEN_NAMES) expect(tokens[name]).toBeTruthy();
    expect(tokens.border).toBe('#123456');
    expect(tokens['bg-base']).toBe(base.background);
  });
});

describe('mergeImportedPreset', () => {
  it('leaves an unreserved id alone', () => {
    expect(mergeImportedPreset(base, ['dark', 'light'])).toBe(base);
  });

  it('suffixes id and name on collision, skipping taken suffixes', () => {
    const merged = mergeImportedPreset(base, ['nord', 'nord-2']);
    expect(merged.id).toBe('nord-3');
    expect(merged.name).toBe('Nord (3)');
  });
});

describe('presetContentEquals', () => {
  it('ignores id and name, compares colours and overrides', () => {
    expect(presetContentEquals(base, { ...base, id: 'nord-2', name: 'Nord (2)' })).toBe(true);
    expect(presetContentEquals(base, { ...base, accent: '#ffffff' })).toBe(false);
    expect(presetContentEquals(base, { ...base, overrides: { border: '#000000' } })).toBe(false);
  });
});
