// OKLCH/sRGB colour math for the theme engine. Ported from the author's
// sarde-studio project (src/lib/utils/color.js).

export type Oklch = [l: number, c: number, h: number];
export type Rgb = [r: number, g: number, b: number];

function oklabToLinearSrgb(l0: number, a: number, b: number): Rgb {
  const l_ = l0 + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l0 - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l0 - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3,
    m = m_ ** 3,
    s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearSrgbToOklab(r: number, g: number, b: number): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

const linearToSrgb = (c: number): number => {
  c = Math.min(1, Math.max(0, c));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

const srgbToLinear = (c: number): number =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;

function oklchToLinearRgb(l: number, c: number, hDeg: number): Rgb {
  const hRad = (hDeg * Math.PI) / 180;
  return oklabToLinearSrgb(l, c * Math.cos(hRad), c * Math.sin(hRad));
}

const rgbToHex = (rgb: number[]): string =>
  '#' + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');

export function oklchToHex(l: number, c: number, hDeg: number): string {
  return rgbToHex(oklchToLinearRgb(l, c, hDeg).map((v) => Math.round(linearToSrgb(v) * 255)));
}

export function hexToOklch(hex: string): Oklch {
  const rgb = hexToRgb(hex);
  const [l, a, bb] = linearSrgbToOklab(
    srgbToLinear(rgb[0] / 255),
    srgbToLinear(rgb[1] / 255),
    srgbToLinear(rgb[2] / 255),
  );
  let h = (Math.atan2(bb, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [l, Math.hypot(a, bb), h];
}

function inGamut(l: number, c: number, hDeg: number): boolean {
  if (l < 0 || l > 1) return false;
  return oklchToLinearRgb(l, c, hDeg).every((v) => v >= -1e-4 && v <= 1 + 1e-4);
}

function maxChroma(l: number, hDeg: number): number {
  if (!inGamut(l, 0, hDeg)) return 0;
  let lo = 0,
    hi = 0.5;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(l, mid, hDeg)) lo = mid;
    else hi = mid;
  }
  return lo;
}

export const clampChroma = (l: number, c: number, hDeg: number): number =>
  Math.min(c, maxChroma(l, hDeg));

export function compositeOver(fgHex: string, alpha: number, bgHex: string): string {
  const f = hexToRgb(fgHex);
  const b = hexToRgb(bgHex);
  const mix = (fc: number, bc: number): number => Math.round(fc * alpha + bc * (1 - alpha));
  return rgbToHex([mix(f[0], b[0]), mix(f[1], b[1]), mix(f[2], b[2])]);
}

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '');
  const n =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h;
  const int = parseInt(n, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/**
 * Splits an optional alpha channel off a CSS hex colour: #rgb, #rgba,
 * #rrggbb, and #rrggbbaa → { hex6, alpha } with alpha 1 when absent; null for
 * anything else. hexToRgb silently mis-parses 8-digit hex, so alpha must be
 * stripped here before any other colour function sees the value.
 */
export function splitAlphaHex(hex: unknown): { hex6: string; alpha: number } | null {
  if (typeof hex !== 'string') return null;
  const m = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  let h = m[1].toLowerCase();
  if (h.length <= 4)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  const alpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { hex6: `#${h.slice(0, 6)}`, alpha };
}

const srgbChan = (c: number): number => {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = ([r, g, b]: Rgb): number =>
  0.2126 * srgbChan(r) + 0.7152 * srgbChan(g) + 0.0722 * srgbChan(b);

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexToRgb(hexA));
  const lB = relativeLuminance(hexToRgb(hexB));
  const [hi, lo]: [number, number] = lA > lB ? [lA, lB] : [lB, lA];
  return (hi + 0.05) / (lo + 0.05);
}
