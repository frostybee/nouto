// Preset helpers for the engine-backed ("custom") themes. Adapted from the
// author's sarde-studio model: presets are flat and single-mode. Nouto keeps
// its 27 built-in themes as static CSS, so a preset here is always one the
// user installed from the catalog, imported from a file, or forked from a
// built-in — the caller supplies the reserved id set (built-in ids + existing
// custom ids) instead of this module knowing about built-ins.

import { deriveThemeTokens, type ThemeTokens } from './engine';
import type { ThemePreset } from './schema';

/** Full --sd-* token set for a preset (its overrides applied verbatim). */
export function deriveTokensForPreset(preset: ThemePreset): ThemeTokens {
  return deriveThemeTokens(preset, preset.mode);
}

/**
 * Re-ids an incoming preset so it can never collide with a reserved id:
 * `dracula-theme` becomes `dracula-theme-2`, "Dracula Theme" becomes
 * "Dracula Theme (2)".
 */
export function mergeImportedPreset(
  preset: ThemePreset,
  reservedIds: Iterable<string>,
): ThemePreset {
  const reserved = new Set(reservedIds);
  if (!reserved.has(preset.id)) return preset;
  let n = 2;
  while (reserved.has(`${preset.id}-${n}`)) n += 1;
  return { ...preset, id: `${preset.id}-${n}`, name: `${preset.name} (${n})` };
}

/**
 * Content identity for install dedupe: same source theme → same colours,
 * regardless of the id suffix a collision added.
 */
export function presetContentEquals(a: ThemePreset, b: ThemePreset): boolean {
  return (
    a.mode === b.mode &&
    a.accent === b.accent &&
    a.background === b.background &&
    a.foreground === b.foreground &&
    a.contrast === b.contrast &&
    JSON.stringify(a.overrides ?? null) === JSON.stringify(b.overrides ?? null)
  );
}
