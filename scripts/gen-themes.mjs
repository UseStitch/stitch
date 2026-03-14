/**
 * Theme generator script.
 *
 * Converts hex color palettes into full OKLCH-based theme JSON files
 * compatible with the Openwork theme system.
 *
 * Usage:
 *   bun run scripts/gen-themes.mjs
 *
 * To add a new theme, append an entry to the THEMES array at the bottom
 * of this file and re-run the script.
 */

import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Color math: hex -> OKLCH
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return {
    r: parseInt(hex.substring(0, 2), 16) / 255,
    g: parseInt(hex.substring(2, 4), 16) / 255,
    b: parseInt(hex.substring(4, 6), 16) / 255,
  };
}

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  let r = srgbToLinear(rgb.r);
  let g = srgbToLinear(rgb.g);
  let b = srgbToLinear(rgb.b);

  let l_ = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  let m_ = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  let s_ = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  l_ = Math.cbrt(l_);
  m_ = Math.cbrt(m_);
  s_ = Math.cbrt(s_);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bVal = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const C = Math.sqrt(a * a + bVal * bVal);
  let H = (Math.atan2(bVal, a) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { l: L, c: C, h: H };
}

function fromHex(hex) {
  const v = hexToOklch(hex);
  return { l: v.l, c: v.c, h: v.h };
}

// ---------------------------------------------------------------------------
// OKLCH formatting & contrast helpers
// ---------------------------------------------------------------------------

function oklch(l, c, h) {
  return (
    'oklch(' +
    Math.max(0, Math.min(1, l)).toFixed(3) +
    ' ' +
    Math.max(0, c).toFixed(3) +
    ' ' +
    h.toFixed(1) +
    ')'
  );
}

/** Move fgL away from baseL until the gap is at least `min`. */
function ensureContrast(baseL, fgL, min) {
  if (Math.abs(baseL - fgL) >= min) return fgL;
  if (fgL >= baseL) {
    const up = Math.min(1, baseL + min);
    if (Math.abs(baseL - up) >= min) return up;
    return Math.max(0, baseL - min);
  }
  const down = Math.max(0, baseL - min);
  if (Math.abs(baseL - down) >= min) return down;
  return Math.min(1, baseL + min);
}

// ---------------------------------------------------------------------------
// Token builders  (palette -> full OKLCH token map)
// ---------------------------------------------------------------------------

function makeLight(p) {
  const bg = p.neutral;
  const fg = p.ink;
  const bgL = bg.l;
  const fgL = ensureContrast(bgL, fg.l, 0.52);
  const pfgL = ensureContrast(p.primary.l, 0.985, 0.42);

  return {
    background: oklch(bgL, bg.c * 0.3, bg.h),
    foreground: oklch(fgL, fg.c * 0.5, fg.h),
    card: oklch(Math.min(1, bgL + 0.03), bg.c * 0.2, bg.h),
    'card-foreground': oklch(fgL, fg.c * 0.5, fg.h),
    popover: oklch(Math.min(1, bgL + 0.03), bg.c * 0.2, bg.h),
    'popover-foreground': oklch(fgL, fg.c * 0.5, fg.h),
    primary: oklch(p.primary.l, p.primary.c, p.primary.h),
    'primary-foreground': oklch(pfgL, 0, 0),
    secondary: oklch(bgL - 0.03, bg.c * 1.2, bg.h),
    'secondary-foreground': oklch(fgL + 0.05, fg.c * 0.6, fg.h),
    muted: oklch(bgL - 0.02, bg.c * 1.5, bg.h),
    'muted-foreground': oklch(fgL + 0.23, fg.c * 0.5, fg.h),
    accent: oklch(bgL - 0.05, bg.c * 2, bg.h),
    'accent-foreground': oklch(fgL + 0.02, fg.c * 0.6, fg.h),
    destructive: oklch(p.error.l, p.error.c, p.error.h),
    'destructive-foreground': oklch(0.985, 0, 0),
    success: oklch(p.success.l, p.success.c, p.success.h),
    'success-foreground': oklch(0.985, 0, 0),
    warning: oklch(p.warning.l, p.warning.c, p.warning.h),
    'warning-foreground': oklch(0.16, 0.05, p.warning.h),
    info: oklch(p.info.l, p.info.c, p.info.h),
    'info-foreground': oklch(0.985, 0, 0),
    border: oklch(bgL - 0.07, bg.c * 1.5, bg.h),
    input: oklch(bgL - 0.07, bg.c * 1.5, bg.h),
    ring: oklch(p.primary.l + 0.1, p.primary.c * 0.7, p.primary.h),
    'chart-1': oklch(p.primary.l, p.primary.c, p.primary.h),
    'chart-2': oklch(p.success.l, p.success.c, p.success.h),
    'chart-3': oklch(p.info.l, p.info.c, p.info.h),
    'chart-4': oklch(p.warning.l, p.warning.c, p.warning.h),
    'chart-5': oklch(p.accent.l, p.accent.c, p.accent.h),
    sidebar: oklch(bgL - 0.02, bg.c * 0.8, bg.h),
    'sidebar-foreground': oklch(fgL, fg.c * 0.5, fg.h),
    'sidebar-primary': oklch(p.primary.l, p.primary.c, p.primary.h),
    'sidebar-primary-foreground': oklch(pfgL, 0, 0),
    'sidebar-accent': oklch(bgL - 0.06, bg.c * 1.8, bg.h),
    'sidebar-accent-foreground': oklch(fgL + 0.02, fg.c * 0.6, fg.h),
    'sidebar-border': oklch(bgL - 0.08, bg.c * 1.5, bg.h),
    'sidebar-ring': oklch(p.primary.l + 0.1, p.primary.c * 0.7, p.primary.h),
  };
}

function makeDark(p) {
  const bg = p.neutral;
  const fg = p.ink;
  const bgL = bg.l;
  const fgL = ensureContrast(bgL, fg.l, 0.52);
  const pfgL = ensureContrast(p.primary.l, bgL, 0.42);

  return {
    background: oklch(bgL, bg.c, bg.h),
    foreground: oklch(fgL, fg.c * 0.3, fg.h),
    card: oklch(bgL + 0.04, bg.c * 1.2, bg.h),
    'card-foreground': oklch(fgL, fg.c * 0.3, fg.h),
    popover: oklch(bgL + 0.04, bg.c * 1.2, bg.h),
    'popover-foreground': oklch(fgL, fg.c * 0.3, fg.h),
    primary: oklch(p.primary.l, p.primary.c, p.primary.h),
    'primary-foreground': oklch(pfgL, bg.c * 0.5, bg.h),
    secondary: oklch(bgL + 0.06, bg.c * 1.5, bg.h),
    'secondary-foreground': oklch(fgL, fg.c * 0.3, fg.h),
    muted: oklch(bgL + 0.05, bg.c * 1.3, bg.h),
    'muted-foreground': oklch(fgL - 0.2, fg.c * 0.5, fg.h),
    accent: oklch(bgL + 0.08, bg.c * 2, bg.h),
    'accent-foreground': oklch(fgL, fg.c * 0.3, fg.h),
    destructive: oklch(p.error.l, p.error.c, p.error.h),
    'destructive-foreground': oklch(0.985, 0, 0),
    success: oklch(p.success.l, p.success.c, p.success.h),
    'success-foreground': oklch(bgL, bg.c, bg.h),
    warning: oklch(p.warning.l, p.warning.c, p.warning.h),
    'warning-foreground': oklch(0.16, 0.05, p.warning.h),
    info: oklch(p.info.l, p.info.c, p.info.h),
    'info-foreground': oklch(bgL, bg.c, bg.h),
    border: oklch(bgL + 0.1, bg.c * 1.5, bg.h),
    input: oklch(bgL + 0.12, bg.c * 1.5, bg.h),
    ring: oklch(p.primary.l - 0.1, p.primary.c * 0.7, p.primary.h),
    'chart-1': oklch(p.primary.l, p.primary.c, p.primary.h),
    'chart-2': oklch(p.success.l, p.success.c, p.success.h),
    'chart-3': oklch(p.info.l, p.info.c, p.info.h),
    'chart-4': oklch(p.warning.l, p.warning.c, p.warning.h),
    'chart-5': oklch(p.accent.l, p.accent.c, p.accent.h),
    sidebar: oklch(bgL - 0.04, bg.c * 0.8, bg.h),
    'sidebar-foreground': oklch(fgL, fg.c * 0.3, fg.h),
    'sidebar-primary': oklch(p.primary.l, p.primary.c, p.primary.h),
    'sidebar-primary-foreground': oklch(0.985, 0, 0),
    'sidebar-accent': oklch(bgL + 0.06, bg.c * 1.5, bg.h),
    'sidebar-accent-foreground': oklch(fgL, fg.c * 0.3, fg.h),
    'sidebar-border': oklch(bgL + 0.1, bg.c * 1.5, bg.h),
    'sidebar-ring': oklch(p.primary.l - 0.1, p.primary.c * 0.7, p.primary.h),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function parseL(oklchStr) {
  const m = oklchStr.match(/oklch\(\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 0;
}

function validate(label, tokens) {
  let ok = true;
  const bgL = parseL(tokens.background);
  const fgL = parseL(tokens.foreground);
  const priL = parseL(tokens.primary);
  const pfgL = parseL(tokens['primary-foreground']);
  const destL = parseL(tokens.destructive);
  const dfgL = parseL(tokens['destructive-foreground']);
  const mutL = parseL(tokens.muted);
  const secL = parseL(tokens.secondary);
  const accL = parseL(tokens.accent);

  const contrasts = [
    { name: 'bg-fg', diff: Math.abs(bgL - fgL), min: 0.5 },
    { name: 'pri-pfg', diff: Math.abs(priL - pfgL), min: 0.4 },
    { name: 'dest-dfg', diff: Math.abs(destL - dfgL), min: 0.25 },
  ];
  for (const c of contrasts) {
    const pass = c.diff >= c.min;
    if (!pass) ok = false;
    console.log(`  ${label} ${c.name}: ${c.diff.toFixed(3)} (>=${c.min}) ${pass ? 'OK' : 'FAIL'}`);
  }

  const pairs = [
    ['muted-sec', mutL, secL],
    ['muted-acc', mutL, accL],
    ['sec-acc', secL, accL],
  ];
  for (const [name, a, b] of pairs) {
    const diff = Math.abs(a - b);
    const pass = diff >= 0.005;
    if (!pass) ok = false;
    console.log(`  ${label} ${name}: ${diff.toFixed(3)} ${pass ? 'OK' : 'SAME'}`);
  }

  return ok;
}

// ---------------------------------------------------------------------------
// Theme definitions
//
// To add a new theme:
//   1. Add an entry to this array with hex palette colors for light & dark.
//   2. Run `bun run scripts/gen-themes.mjs`.
//   3. Import the new JSON in apps/web/src/lib/theme.ts and add it to THEMES.
// ---------------------------------------------------------------------------

const THEMES = [
  {
    name: 'tokyonight',
    label: 'Tokyo Night',
    radius: '0.5rem',
    light: {
      neutral: '#e1e2e7',
      ink: '#273153',
      primary: '#2e7de9',
      accent: '#b15c00',
      success: '#587539',
      warning: '#8c6c3e',
      error: '#c94060',
      info: '#007197',
    },
    dark: {
      neutral: '#1a1b26',
      ink: '#c0caf5',
      primary: '#7aa2f7',
      accent: '#ff9e64',
      success: '#9ece6a',
      warning: '#e0af68',
      error: '#f7768e',
      info: '#7dcfff',
    },
  },
  {
    name: 'solarized',
    label: 'Solarized',
    radius: '0.5rem',
    light: {
      neutral: '#fdf6e3',
      ink: '#586e75',
      primary: '#268bd2',
      accent: '#d33682',
      success: '#859900',
      warning: '#b58900',
      error: '#dc322f',
      info: '#2aa198',
    },
    dark: {
      neutral: '#002b36',
      ink: '#93a1a1',
      primary: '#6c71c4',
      accent: '#d33682',
      success: '#859900',
      warning: '#b58900',
      error: '#dc322f',
      info: '#2aa198',
    },
  },
  {
    name: 'dracula',
    label: 'Dracula',
    radius: '0.625rem',
    light: {
      neutral: '#f8f8f2',
      ink: '#1f1f2f',
      primary: '#7c6bf5',
      accent: '#d16090',
      success: '#2fbf71',
      warning: '#f7a14d',
      error: '#d9536f',
      info: '#1d7fc5',
    },
    dark: {
      neutral: '#1d1e28',
      ink: '#f8f8f2',
      primary: '#bd93f9',
      accent: '#ff79c6',
      success: '#50fa7b',
      warning: '#ffb86c',
      error: '#ff5555',
      info: '#8be9fd',
    },
  },
];

// ---------------------------------------------------------------------------
// Generate & validate
// ---------------------------------------------------------------------------

const THEMES_DIR = join(process.cwd(), 'apps', 'web', 'src', 'themes');

function hexPaletteToOklch(hex) {
  return {
    neutral: fromHex(hex.neutral),
    ink: fromHex(hex.ink),
    primary: fromHex(hex.primary),
    accent: fromHex(hex.accent),
    success: fromHex(hex.success),
    warning: fromHex(hex.warning),
    error: fromHex(hex.error),
    info: fromHex(hex.info),
  };
}

let allPassed = true;

for (const theme of THEMES) {
  const lightPalette = hexPaletteToOklch(theme.light);
  const darkPalette = hexPaletteToOklch(theme.dark);

  const output = JSON.stringify(
    {
      name: theme.name,
      label: theme.label,
      radius: theme.radius,
      light: makeLight(lightPalette),
      dark: makeDark(darkPalette),
    },
    null,
    2,
  );

  const outPath = join(THEMES_DIR, `${theme.name}.json`);
  writeFileSync(outPath, output + '\n');
  console.log(`Generated: ${theme.name}.json`);

  const data = JSON.parse(readFileSync(outPath, 'utf-8'));
  console.log(`Validating ${theme.name}:`);
  if (!validate(`${theme.name} light`, data.light)) allPassed = false;
  if (!validate(`${theme.name} dark`, data.dark)) allPassed = false;
  console.log();
}

if (!allPassed) {
  console.error('Some validations failed.');
  process.exit(1);
}

console.log('All themes generated and validated successfully.');
