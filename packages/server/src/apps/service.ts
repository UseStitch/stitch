import type { AppEnabledState, AppId } from '@stitch/shared/apps/types';

import { APP_MANIFESTS, findAppByToolsetId } from '@/apps/registry.js';
import { isToolEnabled } from '@/tools/enabled-service.js';

export async function isAppEnabled(appId: AppId): Promise<boolean> {
  return isToolEnabled({ scope: 'app', identifier: appId });
}

export async function getAppEnabledStates(): Promise<AppEnabledState[]> {
  return Promise.all(APP_MANIFESTS.map(async (app) => ({ appId: app.id, enabled: await isAppEnabled(app.id) })));
}

export async function isToolsetEnabledByApp(toolsetId: string): Promise<boolean> {
  const app = findAppByToolsetId(toolsetId);
  if (!app) return true;
  return isAppEnabled(app.id);
}

export async function getDisabledAppToolsetIds(): Promise<Set<string>> {
  const states = await getAppEnabledStates();
  const disabledAppIds = new Set(states.filter((state) => !state.enabled).map((state) => state.appId));

  return new Set(APP_MANIFESTS.filter((app) => disabledAppIds.has(app.id)).flatMap((app) => app.toolsetIds));
}

export async function getDisabledAppSkillNames(): Promise<Set<string>> {
  const states = await getAppEnabledStates();
  const disabledAppIds = new Set(states.filter((state) => !state.enabled).map((state) => state.appId));

  return new Set(APP_MANIFESTS.filter((app) => disabledAppIds.has(app.id)).flatMap((app) => app.skillNames));
}

export async function isSkillEnabledByApp(skillName: string): Promise<boolean> {
  const disabledSkillNames = await getDisabledAppSkillNames();
  return !disabledSkillNames.has(skillName);
}
