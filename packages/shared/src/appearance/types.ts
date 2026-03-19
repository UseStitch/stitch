export const APPEARANCE_MODES = ['light', 'dark', 'system'] as const;

export type AppearanceMode = (typeof APPEARANCE_MODES)[number];
