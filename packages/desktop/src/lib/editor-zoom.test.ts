import { describe, expect, it } from 'vitest';
import { stepFontSize } from './editor-zoom';

describe('stepFontSize', () => {
  it('walks the FONT_SIZES ladder one rung at a time', () => {
    expect(stepFontSize(13, 1)).toBe(14);
    expect(stepFontSize(13, -1)).toBe(12);
    expect(stepFontSize(18, 1)).toBe(20);
    expect(stepFontSize(20, -1)).toBe(18);
  });

  it('clamps at both ends', () => {
    expect(stepFontSize(30, 1)).toBe(30);
    expect(stepFontSize(8, -1)).toBe(8);
    expect(stepFontSize(40, 1)).toBe(30);
    expect(stepFontSize(40, -1)).toBe(30);
  });

  it('snaps a value between rungs to the nearest rung in the step direction', () => {
    expect(stepFontSize(19, 1)).toBe(20);
    expect(stepFontSize(19, -1)).toBe(18);
    expect(stepFontSize(5, 1)).toBe(8);
  });
});
