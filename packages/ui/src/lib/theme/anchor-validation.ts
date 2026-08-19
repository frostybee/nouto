// Contrast gate for theme anchors. Ported from the author's sarde-studio
// project (src/lib/theme/anchor-validation.js). Import shares this gate so a
// pasted or malformed theme can't sneak an unreadable anchor set past it —
// anchors are rejected with actionable feedback, never silently corrected.

import { isHexColor } from './schema';
import { contrastRatio } from './color';

/** WCAG AA normal text — mirrors the engine's floor for the `text` token. */
export const FG_BG_CONTRAST_FLOOR = 4.5;
/** WCAG 1.4.11 UI-component floor — mirrors the engine's `border-focus`
 * floor. */
export const ACCENT_BG_CONTRAST_FLOOR = 3;

const LABELS = {
  accent: 'Accent',
  background: 'Background',
  foreground: 'Foreground',
} as const;

type AnchorField = keyof typeof LABELS;

export type AnchorEditResult =
  { valid: true } | { valid: false; field: AnchorField; message: string };

/** Never throws; missing input just fails the first hex check. */
export function validateAnchorEdit(
  anchors: Partial<Record<AnchorField, unknown>> = {},
): AnchorEditResult {
  const { accent, background, foreground } = anchors;
  for (const [field, value] of [
    ['accent', accent],
    ['background', background],
    ['foreground', foreground],
  ] as [AnchorField, unknown][]) {
    if (!isHexColor(value)) {
      return {
        valid: false,
        field,
        message: `${LABELS[field]} must be a hex color like #4f8ac9.`,
      };
    }
  }
  const fgBg = contrastRatio(foreground as string, background as string);
  if (fgBg < FG_BG_CONTRAST_FLOOR) {
    return {
      valid: false,
      field: 'foreground',
      message: `Foreground needs at least ${FG_BG_CONTRAST_FLOOR}:1 contrast against the background for readable text (currently ${fgBg.toFixed(1)}:1).`,
    };
  }
  const accentBg = contrastRatio(accent as string, background as string);
  if (accentBg < ACCENT_BG_CONTRAST_FLOOR) {
    return {
      valid: false,
      field: 'accent',
      message: `Accent needs at least ${ACCENT_BG_CONTRAST_FLOOR}:1 contrast against the background to stay visible (currently ${accentBg.toFixed(1)}:1).`,
    };
  }
  return { valid: true };
}
