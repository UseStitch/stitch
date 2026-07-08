export const APP_IDS = ['browser', 'recordings', 'agenda', 'mail'] as const;

export type AppId = (typeof APP_IDS)[number];

export type AppEnabledState = { appId: AppId; enabled: boolean };
