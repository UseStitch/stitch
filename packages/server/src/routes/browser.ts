import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';

import { importChromeProfile, listChromeProfiles } from '@/lib/browser/chrome-profile-importer.js';
import { saveSetting } from '@/settings/service.js';

const importSchema = z.object({ profileId: z.string() });

export const browserRouter = new Hono();

browserRouter.get('/profiles', async (c) => {
  const profiles = await listChromeProfiles();
  return c.json(profiles);
});

browserRouter.post('/import-profile', zValidator('json', importSchema), async (c) => {
  if (process.platform === 'win32') {
    return c.json({ error: 'Profile importing is not supported on Windows' }, 400);
  }

  const { profileId } = c.req.valid('json');

  try {
    const profiles = await listChromeProfiles();
    const profile = profiles.find((p) => p.id === profileId);
    const profileLabel = profile
      ? `${profile.name}${profile.email ? ` (${profile.email})` : ''}`
      : profileId;

    await importChromeProfile(profileId);

    const timestamp = new Date().toISOString();
    await saveSetting('browser.profileImported', `${profileLabel} — ${timestamp}`);
    await saveSetting('browser.activeProfile', `chrome/${profileId}`);

    return c.json({ success: true, profile: profileLabel });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    return c.json({ error: message }, 500);
  }
});
