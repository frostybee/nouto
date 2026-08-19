import { describe, it, expect } from 'vitest';
import { isHexColor, validateThemePreset, type ThemePreset } from './schema';

const validPreset = (): ThemePreset => ({
  id: 'test-dark',
  name: 'Test Dark',
  mode: 'dark',
  accent: '#5b8eef',
  background: '#17181c',
  foreground: '#e9eaed',
  contrast: 50,
  overrides: null,
});

describe('isHexColor', () => {
  it('accepts 3- and 6-digit hex, either case', () => {
    for (const v of ['#fff', '#FFF', '#17181c', '#5B8EEF']) expect(isHexColor(v)).toBe(true);
  });

  it('rejects non-hex values', () => {
    for (const v of [
      'fff',
      '#ffff',
      '#gggggg',
      'rgb(0, 0, 0)',
      'rgba(0, 0, 0, 0.5)',
      '',
      null,
      42,
    ]) {
      expect(isHexColor(v)).toBe(false);
    }
  });
});

describe('validateThemePreset', () => {
  it('passes a valid preset', () => {
    expect(validateThemePreset(validPreset())).toEqual([]);
  });

  it('fails when each required field is removed or mistyped', () => {
    for (const field of ['id', 'name', 'mode', 'accent', 'background', 'foreground', 'contrast']) {
      const rest: Partial<ThemePreset> = validPreset();
      delete rest[field as keyof ThemePreset];
      expect(validateThemePreset(rest).length).toBeGreaterThan(0);
      expect(validateThemePreset({ ...validPreset(), [field]: [] }).length).toBeGreaterThan(0);
    }
  });

  it('accepts a valid override map and rejects unknown token keys', () => {
    expect(
      validateThemePreset({
        ...validPreset(),
        overrides: { 'text-muted': '#6c7086' },
      }),
    ).toEqual([]);
    expect(
      validateThemePreset({
        ...validPreset(),
        overrides: { 'not-a-token': '#000000' },
      }).length,
    ).toBeGreaterThan(0);
    expect(
      validateThemePreset({ ...validPreset(), overrides: { accent: '' } }).length,
    ).toBeGreaterThan(0);
  });

  it('rejects an invalid mode', () => {
    expect(validateThemePreset({ ...validPreset(), mode: 'auto' }).length).toBeGreaterThan(0);
  });

  it('fails out-of-range contrast and non-object input', () => {
    expect(validateThemePreset({ ...validPreset(), contrast: 150 }).length).toBeGreaterThan(0);
    expect(validateThemePreset(null).length).toBeGreaterThan(0);
    expect(validateThemePreset([]).length).toBeGreaterThan(0);
  });
});
