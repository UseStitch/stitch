export const APPEARANCE_MODES = ['light', 'dark', 'system'] as const;
export const APPEARANCE_THEMES = ['default', 'solarized', 'tokyonight', 'dracula'] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];
export type AppearanceTheme = (typeof APPEARANCE_THEMES)[number];
