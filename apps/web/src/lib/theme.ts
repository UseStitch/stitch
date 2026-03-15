import type { AppearanceMode } from '@openwork/shared';

import defaultTheme from '@/themes/default.json';
import draculaTheme from '@/themes/dracula.json';
import solarizedTheme from '@/themes/solarized.json';
import tokyonightTheme from '@/themes/tokyonight.json';

export const THEME_TOKEN_KEYS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'success',
  'success-foreground',
  'warning',
  'warning-foreground',
  'info',
  'info-foreground',
  'border',
  'input',
  'ring',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'sidebar',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-ring',
] as const;

export type ThemeTokenKey = (typeof THEME_TOKEN_KEYS)[number];
export type ThemeTokens = Record<ThemeTokenKey, string>;

type ThemeDefinition = {
  name: string;
  label: string;
  radius: string;
  light: ThemeTokens;
  dark: ThemeTokens;
};

export const THEMES: ThemeDefinition[] = [
  defaultTheme satisfies ThemeDefinition,
  tokyonightTheme satisfies ThemeDefinition,
  solarizedTheme satisfies ThemeDefinition,
  draculaTheme satisfies ThemeDefinition,
];

export const DEFAULT_THEME = 'default';
export const DEFAULT_MODE: AppearanceMode = 'system';

export function getTheme(name: string): ThemeDefinition {
  return THEMES.find((t) => t.name === name) ?? (THEMES[0] as ThemeDefinition);
}

function buildCssVars(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join('\n');
}

function buildThemeCss(theme: ThemeDefinition): string {
  const lightVars = buildCssVars(theme.light);
  const darkVars = buildCssVars(theme.dark);
  const radiusVar = `  --radius: ${theme.radius};`;
  return `:root {\n${radiusVar}\n${lightVars}\n}\n\n.dark {\n${darkVars}\n}`;
}

const THEME_STYLE_ID = 'openwork-theme';

export function injectThemeCss(theme: ThemeDefinition): void {
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildThemeCss(theme);
}

export function applyAppearanceMode(mode: AppearanceMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', mode === 'dark');
  }
}
