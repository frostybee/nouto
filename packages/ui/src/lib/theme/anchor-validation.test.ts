import { describe, it, expect } from 'vitest';
import {
  validateAnchorEdit,
  FG_BG_CONTRAST_FLOOR,
  ACCENT_BG_CONTRAST_FLOOR,
} from './anchor-validation';

const VALID = {
  accent: '#4f8ac9',
  background: '#1e1e2e',
  foreground: '#cdd6f4',
};

describe('validateAnchorEdit', () => {
  it('accepts a readable anchor set', () => {
    expect(validateAnchorEdit(VALID)).toEqual({ valid: true });
  });

  it.each(['accent', 'background', 'foreground'] as const)(
    'rejects a non-hex %s with that field named',
    (field) => {
      for (const bad of ['red', '#12345', '#gggggg', '', null, undefined, 42]) {
        const result = validateAnchorEdit({ ...VALID, [field]: bad });
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.field).toBe(field);
          expect(result.message).toContain('hex color');
        }
      }
    },
  );

  it('never throws on missing or non-object input', () => {
    expect(validateAnchorEdit().valid).toBe(false);
    expect(validateAnchorEdit({}).valid).toBe(false);
  });

  it(`rejects foreground/background below ${FG_BG_CONTRAST_FLOOR}:1 at the boundary`, () => {
    // #767676 on white is 4.54:1 (passes); #777777 is 4.48:1 (fails).
    const pass = validateAnchorEdit({
      accent: '#000000',
      background: '#ffffff',
      foreground: '#767676',
    });
    expect(pass).toEqual({ valid: true });
    const fail = validateAnchorEdit({
      accent: '#000000',
      background: '#ffffff',
      foreground: '#777777',
    });
    expect(fail.valid).toBe(false);
    if (!fail.valid) {
      expect(fail.field).toBe('foreground');
      expect(fail.message).toMatch(/4\.5:1.*currently 4\.5:1|currently 4\.[0-4]/);
    }
  });

  it(`rejects accent/background below ${ACCENT_BG_CONTRAST_FLOOR}:1 at the boundary`, () => {
    // #949494 on white is 3.03:1 (passes); #999999 is 2.85:1 (fails).
    const pass = validateAnchorEdit({
      accent: '#949494',
      background: '#ffffff',
      foreground: '#000000',
    });
    expect(pass).toEqual({ valid: true });
    const fail = validateAnchorEdit({
      accent: '#999999',
      background: '#ffffff',
      foreground: '#000000',
    });
    expect(fail.valid).toBe(false);
    if (!fail.valid) {
      expect(fail.field).toBe('accent');
      expect(fail.message).toContain('currently 2.8:1');
    }
  });

  it('reports the foreground floor before the accent floor when both fail', () => {
    const result = validateAnchorEdit({
      accent: '#eeeeee',
      background: '#ffffff',
      foreground: '#ffffff',
    });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.field).toBe('foreground');
  });
});
