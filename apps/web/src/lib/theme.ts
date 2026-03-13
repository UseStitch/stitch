import type { AppearanceMode } from '@openwork/shared'
import defaultTheme from '@/themes/default.json'
import oceanTheme from '@/themes/ocean.json'
import roseTheme from '@/themes/rose.json'

export type ThemeTokens = Record<string, string>

export type ThemeDefinition = {
  name: string
  label: string
  light: ThemeTokens
  dark: ThemeTokens
}

export const THEMES: ThemeDefinition[] = [
  defaultTheme as ThemeDefinition,
  oceanTheme as ThemeDefinition,
  roseTheme as ThemeDefinition,
]

export const DEFAULT_THEME = 'default'
export const DEFAULT_MODE: AppearanceMode = 'system'

export function getTheme(name: string): ThemeDefinition {
  return THEMES.find((t) => t.name === name) ?? (THEMES[0] as ThemeDefinition)
}

function buildCssVars(tokens: ThemeTokens): string {
  return Object.entries(tokens)
    .map(([key, value]) => `  --${key}: ${value};`)
    .join('\n')
}

export function buildThemeCss(theme: ThemeDefinition): string {
  const lightVars = buildCssVars(theme.light)
  const darkVars = buildCssVars(theme.dark)
  return `:root {\n${lightVars}\n}\n\n.dark {\n${darkVars}\n}`
}

const THEME_STYLE_ID = 'openwork-theme'

export function injectThemeCss(theme: ThemeDefinition): void {
  let el = document.getElementById(THEME_STYLE_ID) as HTMLStyleElement | null
  if (!el) {
    el = document.createElement('style')
    el.id = THEME_STYLE_ID
    document.head.appendChild(el)
  }
  el.textContent = buildThemeCss(theme)
}

export function applyAppearanceMode(mode: AppearanceMode): void {
  const root = document.documentElement
  if (mode === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    root.classList.toggle('dark', prefersDark)
  } else {
    root.classList.toggle('dark', mode === 'dark')
  }
}
