import { describe, test, expect } from 'vitest';
import { THEMES, THEME_TOKEN_KEYS } from '../src/lib/theme.js';

const OKLCH_PATTERN = /^oklch\(\s*[\d.]+\s+[\d.]+\s+[\d.]+\s*\)$/;

describe('theme validation', () => {
  test('at least one theme is registered', () => {
    expect(THEMES.length).toBeGreaterThan(0);
  });

  test('every theme has a unique name', () => {
    const names = THEMES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  for (const theme of THEMES) {
    describe(`theme: ${theme.name}`, () => {
      test('has a non-empty name and label', () => {
        expect(theme.name.length).toBeGreaterThan(0);
        expect(theme.label.length).toBeGreaterThan(0);
      });

      test('has a valid radius value', () => {
        expect(theme.radius).toMatch(/^\d+(\.\d+)?rem$/);
      });

      for (const mode of ['light', 'dark'] as const) {
        describe(`${mode} mode`, () => {
          test('contains every required token key', () => {
            const tokens = theme[mode];
            const missing = THEME_TOKEN_KEYS.filter((key) => !(key in tokens));
            expect(missing, `missing tokens: ${missing.join(', ')}`).toHaveLength(0);
          });

          test('contains no extra token keys', () => {
            const tokens = theme[mode];
            const validKeys = new Set<string>(THEME_TOKEN_KEYS);
            const extra = Object.keys(tokens).filter((key) => !validKeys.has(key));
            expect(extra, `unexpected tokens: ${extra.join(', ')}`).toHaveLength(0);
          });

          test('all token values are valid oklch colors', () => {
            const tokens = theme[mode];
            for (const key of THEME_TOKEN_KEYS) {
              const value = tokens[key];
              expect(value, `${key} = "${value}" is not a valid oklch color`).toMatch(
                OKLCH_PATTERN,
              );
            }
          });

          test('foreground tokens have sufficient contrast against their background', () => {
            const tokens = theme[mode];
            const bgLightness = parseOklchLightness(tokens['background']);
            const fgLightness = parseOklchLightness(tokens['foreground']);
            const contrast = Math.abs(bgLightness - fgLightness);
            expect(contrast, 'foreground must differ from background by at least 0.5 lightness').toBeGreaterThanOrEqual(0.5);
          });

          test('primary-foreground contrasts with primary', () => {
            const tokens = theme[mode];
            const primaryL = parseOklchLightness(tokens['primary']);
            const primaryFgL = parseOklchLightness(tokens['primary-foreground']);
            const contrast = Math.abs(primaryL - primaryFgL);
            expect(contrast, 'primary-foreground must differ from primary by at least 0.4 lightness').toBeGreaterThanOrEqual(0.4);
          });

          test('destructive-foreground contrasts with destructive', () => {
            const tokens = theme[mode];
            const destructiveL = parseOklchLightness(tokens['destructive']);
            const destructiveFgL = parseOklchLightness(tokens['destructive-foreground']);
            const contrast = Math.abs(destructiveL - destructiveFgL);
            expect(contrast, 'destructive-foreground must differ from destructive by at least 0.25 lightness').toBeGreaterThanOrEqual(0.25);
          });

          test('muted, secondary, and accent are distinct from each other', () => {
            const tokens = theme[mode];
            const mutedL = parseOklchLightness(tokens['muted']);
            const secondaryL = parseOklchLightness(tokens['secondary']);
            const accentL = parseOklchLightness(tokens['accent']);

            expect(mutedL, 'muted and secondary should differ').not.toBeCloseTo(secondaryL, 2);
            expect(mutedL, 'muted and accent should differ').not.toBeCloseTo(accentL, 2);
            expect(secondaryL, 'secondary and accent should differ').not.toBeCloseTo(accentL, 2);
          });
        });
      }
    });
  }
});

function parseOklchLightness(value: string): number {
  const match = value.match(/^oklch\(\s*([\d.]+)/);
  if (!match) throw new Error(`Cannot parse oklch lightness from: ${value}`);
  return parseFloat(match[1] as string);
}
