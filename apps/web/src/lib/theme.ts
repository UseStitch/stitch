import type { AppearanceMode } from '@stitch/shared/appearance/types';

/** Shiki bundled theme ids for each appearance mode. */
export type CodeTheme = { light: string; dark: string };

type ThemeDefinition = { name: string; label: string; code: CodeTheme };

export const THEMES: ThemeDefinition[] = [
  { name: 'default', label: 'Default', code: { light: 'github-light', dark: 'github-dark' } },
  { name: 'tokyonight', label: 'Tokyo Night', code: { light: 'one-light', dark: 'tokyo-night' } },
  { name: 'solarized', label: 'Solarized', code: { light: 'solarized-light', dark: 'solarized-dark' } },
  { name: 'dracula', label: 'Dracula', code: { light: 'catppuccin-latte', dark: 'dracula' } },
];

export const DEFAULT_THEME = 'default';
export const DEFAULT_MODE: AppearanceMode = 'system';

export function getTheme(name: string): ThemeDefinition {
  return THEMES.find((t) => t.name === name) ?? THEMES[0];
}

const SPLASH_MODE_KEY = 'stitch.appearance.mode';
const SPLASH_BG_LIGHT_KEY = 'stitch.splash.bg.light';
const SPLASH_BG_DARK_KEY = 'stitch.splash.bg.dark';

function cacheSplashBackground(theme: ThemeDefinition): void {
  const probe = document.createElement('div');
  probe.dataset.theme = theme.name;
  probe.dataset.themeMode = 'light';
  document.documentElement.appendChild(probe);
  const styles = getComputedStyle(probe);
  localStorage.setItem(SPLASH_BG_LIGHT_KEY, styles.getPropertyValue('--background').trim());
  probe.dataset.themeMode = 'dark';
  localStorage.setItem(SPLASH_BG_DARK_KEY, styles.getPropertyValue('--background').trim());
  probe.remove();
}

export function applyTheme(theme: ThemeDefinition): void {
  document.documentElement.dataset.theme = theme.name;
  cacheSplashBackground(theme);
  setCodeTheme(theme.code);
}

// Published from applyTheme so highlighting can never disagree with the token CSS on the page.
let currentCodeTheme: CodeTheme = getTheme(DEFAULT_THEME).code;
const codeThemeListeners = new Set<() => void>();

function setCodeTheme(code: CodeTheme): void {
  if (currentCodeTheme === code) return;
  currentCodeTheme = code;
  for (const listener of codeThemeListeners) listener();
}

export function getCodeTheme(): CodeTheme {
  return currentCodeTheme;
}

export function subscribeCodeTheme(listener: () => void): () => void {
  codeThemeListeners.add(listener);
  return () => codeThemeListeners.delete(listener);
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
