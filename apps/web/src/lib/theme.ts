import type { AppearanceMode } from '@stitch/shared/appearance/types';

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

type ThemeDefinition = { name: string; label: string; radius: string; light: ThemeTokens; dark: ThemeTokens };

export const THEMES: ThemeDefinition[] = [
  defaultTheme satisfies ThemeDefinition,
  tokyonightTheme satisfies ThemeDefinition,
  solarizedTheme satisfies ThemeDefinition,
  draculaTheme satisfies ThemeDefinition,
];

export const DEFAULT_THEME = 'default';
export const DEFAULT_MODE: AppearanceMode = 'system';

export function getTheme(name: string): ThemeDefinition {
  return THEMES.find((t) => t.name === name) ?? THEMES[0];
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

const THEME_STYLE_ID = 'stitch-theme';

// Persisted so the synchronous splash preload script (see index.html) can paint
// the correct background before the React bundle runs, avoiding a flash on launch.
const SPLASH_MODE_KEY = 'stitch.appearance.mode';
const SPLASH_BG_LIGHT_KEY = 'stitch.splash.bg.light';
const SPLASH_BG_DARK_KEY = 'stitch.splash.bg.dark';

function cacheSplashBackground(theme: ThemeDefinition): void {
  localStorage.setItem(SPLASH_BG_LIGHT_KEY, theme.light.background);
  localStorage.setItem(SPLASH_BG_DARK_KEY, theme.dark.background);
}

export function injectThemeCss(theme: ThemeDefinition): void {
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = THEME_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = buildThemeCss(theme);
  cacheSplashBackground(theme);
}

export function applyAppearanceMode(mode: AppearanceMode): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = mode === 'dark' || (mode === 'system' && prefersDark);
  root.classList.toggle('dark', isDark);
  localStorage.setItem(SPLASH_MODE_KEY, mode);
}

export function removeSplash(): void {
  const splash = document.getElementById('stitch-splash');
  if (!splash) return;
  // Match the html background to the live theme so there is no flash once the
  // splash is gone but before the app's own surfaces cover the viewport.
  const background = getComputedStyle(document.documentElement).getPropertyValue('--background').trim();
  if (background) document.documentElement.style.backgroundColor = background;

  splash.style.transition = 'opacity 200ms ease';
  splash.style.opacity = '0';
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
}
