import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';

import { isLocalProviderId } from '@stitch/shared/providers/types';

import { getDb } from '@/db/client.js';
import { localModels, providerConfig } from '@/db/schema/providers.js';
import { isAllowedProvider } from '@/models/llm/registry.js';
import { ProviderCredentialsSchema, type ProviderCredentials } from '@/provider/config/schema.js';

export async function getProviderCredentials(providerId: string): Promise<ProviderCredentials> {
  if (!isAllowedProvider(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const db = getDb();
  const config = (await db.select().from(providerConfig).where(eq(providerConfig.providerId, providerId))).at(0);
  if (!config) {
    throw new HTTPException(404, { message: 'Provider not configured' });
  }

  return config.credentials;
}

export async function upsertProviderCredentials(providerId: string, body: unknown): Promise<void> {
  if (!isAllowedProvider(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const parsed = ProviderCredentialsSchema.safeParse({ ...(body as Record<string, unknown>), providerId });
  if (!parsed.success) {
    throw new HTTPException(400, { message: 'Invalid credentials' });
  }

  const db = getDb();
  await db
    .insert(providerConfig)
    .values({ providerId, credentials: parsed.data })
    .onConflictDoUpdate({
      target: providerConfig.providerId,
      set: { credentials: parsed.data, updatedAt: Date.now() },
    });
}

export async function deleteProviderCredentials(providerId: string): Promise<void> {
  if (!isAllowedProvider(providerId)) {
    throw new HTTPException(404, { message: 'Provider not found' });
  }

  const db = getDb();
  const result = await db
    .delete(providerConfig)
    .where(eq(providerConfig.providerId, providerId))
    .returning({ providerId: providerConfig.providerId });
  if (result.length === 0) {
    throw new HTTPException(404, { message: 'Provider not configured' });
  }

  if (isLocalProviderId(providerId)) {
    await db.delete(localModels).where(eq(localModels.provider, providerId));
  }
}
