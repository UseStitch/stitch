import { eq } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { providerConfig } from '@/db/schema/providers.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { isAllowedProvider } from '@/models/llm/registry.js';
import { ProviderCredentialsSchema } from '@/provider/config/schema.js';

export async function getProviderCredentials(providerId: string): Promise<ServiceResult<unknown>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const db = getDb();
  const [config] = await db
    .select()
    .from(providerConfig)
    .where(eq(providerConfig.providerId, providerId));
  if (!config) {
    return err('Provider not configured', 404);
  }

  return ok(config.credentials);
}

export async function upsertProviderCredentials(
  providerId: string,
  body: unknown,
): Promise<ServiceResult<null>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const parsed = ProviderCredentialsSchema.safeParse({
    ...(body as Record<string, unknown>),
    providerId,
  });
  if (!parsed.success) {
    return err('Invalid credentials', 400, parsed.error.flatten());
  }

  const db = getDb();
  await db
    .insert(providerConfig)
    .values({ providerId, credentials: parsed.data })
    .onConflictDoUpdate({
      target: providerConfig.providerId,
      set: { credentials: parsed.data, updatedAt: Date.now() },
    });

  return ok(null);
}

export async function deleteProviderCredentials(providerId: string): Promise<ServiceResult<null>> {
  if (!isAllowedProvider(providerId)) {
    return err('Provider not found', 404);
  }

  const db = getDb();
  const result = await db
    .delete(providerConfig)
    .where(eq(providerConfig.providerId, providerId))
    .returning({ providerId: providerConfig.providerId });
  if (result.length === 0) {
    return err('Provider not configured', 404);
  }

  return ok(null);
}
