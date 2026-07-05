import type { AppId } from '@stitch/shared/apps/types';

type AppManifest = { id: AppId; toolsetIds: string[]; skillNames: string[] };

export const APP_MANIFESTS: readonly AppManifest[] = [
  { id: 'browser', toolsetIds: ['browser'], skillNames: ['browser-automation'] },
  { id: 'recordings', toolsetIds: ['recordings'], skillNames: [] },
  { id: 'agenda', toolsetIds: ['agenda'], skillNames: [] },
];

export function findAppByToolsetId(toolsetId: string): AppManifest | undefined {
  return APP_MANIFESTS.find((app) => app.toolsetIds.includes(toolsetId));
}
