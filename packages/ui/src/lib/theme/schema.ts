// Theme preset validation. Ported from the author's sarde-studio project
// (src/lib/theme/schema.js), minus the 12-key syntax palette — the template
// ships no code editor.

import { TOKEN_NAMES, type ThemeAnchors, type ThemeVariantMode } from './engine';

/**
 * A self-contained, single-mode theme: the four anchors plus optional
 * verbatim token overrides. Both bundled presets and imported VS Code themes
 * take this shape; `preferences.json` stores imported ones as-is.
 */
export interface ThemePreset extends ThemeAnchors {
  id: string;
  name: string;
  mode: ThemeVariantMode;
}

/**
 * One mode slot's stored theme state: which preset it points at, whether the
 * anchors were hand-edited (a customized profile derives from its anchors
 * alone — the preset's override map no longer applies), and the anchors
 * themselves. `preferences.json` stores one profile per mode.
 */
export interface ThemeProfile {
  presetId: string;
  customized: boolean;
  accent: string;
  background: string;
  foreground: string;
  contrast: number;
}

export const isHexColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v);

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const inRange = (v: unknown, lo: number, hi: number): boolean =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/** → string[] of errors; empty array = valid profile. */
export function validateThemeProfile(profile: unknown, label = 'profile'): string[] {
  if (!isObject(profile)) return [`${label} must be an object`];
  const errors: string[] = [];
  if (typeof profile.presetId !== 'string' || !profile.presetId)
    errors.push(`${label}.presetId must be a non-empty string`);
  if (typeof profile.customized !== 'boolean') errors.push(`${label}.customized must be a boolean`);
  for (const field of ['accent', 'background', 'foreground'] as const) {
    if (!isHexColor(profile[field])) errors.push(`${label}.${field} must be a hex color`);
  }
  if (!inRange(profile.contrast, 0, 100)) errors.push(`${label}.contrast must be a number 0-100`);
  return errors;
}

/** → string[] of errors; empty array = valid preset. */
export function validateThemePreset(preset: unknown): string[] {
  if (!isObject(preset)) return ['preset must be an object'];
  const errors: string[] = [];
  if (typeof preset.id !== 'string' || !preset.id)
    errors.push('preset.id must be a non-empty string');
  if (typeof preset.name !== 'string' || !preset.name)
    errors.push('preset.name must be a non-empty string');
  if (preset.mode !== 'light' && preset.mode !== 'dark')
    errors.push("preset.mode must be 'light' or 'dark'");
  for (const field of ['accent', 'background', 'foreground'] as const) {
    if (!isHexColor(preset[field])) errors.push(`preset.${field} must be a hex color`);
  }
  if (!inRange(preset.contrast, 0, 100)) errors.push('preset.contrast must be a number 0-100');
  if (preset.overrides != null) {
    if (!isObject(preset.overrides)) {
      errors.push('preset.overrides must be an object or null');
    } else {
      for (const [key, value] of Object.entries(preset.overrides)) {
        if (!(TOKEN_NAMES as readonly string[]).includes(key))
          errors.push(`preset.overrides has unknown token "${key}"`);
        else if (typeof value !== 'string' || !value)
          errors.push(`preset.overrides.${key} must be a non-empty string`);
      }
    }
  }
  return errors;
}
