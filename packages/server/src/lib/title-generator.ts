import { eq } from 'drizzle-orm';
import { generateText } from 'ai';
import { getDb } from '../db/client.js';
import { userSettings, providerConfig } from '../db/schema.js';
import { createProvider } from '../provider/provider.js';
import type { ProviderCredentials } from '../provider/provider.js';
import * as Models from '../provider/models.js';

const TITLE_MODEL_PRIORITY = [
  'claude-haiku-4-5',
  'claude-haiku-4.5',
  'gemini-3-flash',
  'gemini-2.5-flash',
  'gpt-5-nano',
] as const;

async function getTitleGenerationModel(
  fallbackProviderId: string,
  fallbackModelId: string,
): Promise<{ providerId: string; modelId: string; credentials: ProviderCredentials } | null> {
  const db = getDb();

  const [titleSetting, enabledConfigs] = await Promise.all([
    db.select().from(userSettings).where(eq(userSettings.key, 'model.title')),
    db.select().from(providerConfig),
  ]);

  if (titleSetting.length > 0 && titleSetting[0].value) {
    const [providerId, modelId] = titleSetting[0].value.split(':::');
    const config = enabledConfigs.find((c) => c.providerId === providerId);
    if (config) {
      return { providerId, modelId, credentials: config.credentials };
    }
  }

  const modelsData = await Models.get();
  const enabledProviderIds = new Set(enabledConfigs.map((c) => c.providerId));

  for (const modelId of TITLE_MODEL_PRIORITY) {
    for (const providerId of enabledProviderIds) {
      const provider = modelsData[providerId];
      if (provider?.models[modelId]) {
        const config = enabledConfigs.find((c) => c.providerId === providerId);
        if (config) {
          return { providerId, modelId, credentials: config.credentials };
        }
      }
    }
  }

  const fallbackConfig = enabledConfigs.find((c) => c.providerId === fallbackProviderId);
  if (fallbackConfig) {
    return {
      providerId: fallbackProviderId,
      modelId: fallbackModelId,
      credentials: fallbackConfig.credentials,
    };
  }

  return null;
}

export async function generateTitle(
  firstMessage: string,
  fallbackProviderId: string,
  fallbackModelId: string,
): Promise<string | null> {
  const modelInfo = await getTitleGenerationModel(fallbackProviderId, fallbackModelId);
  if (!modelInfo) return null;

  try {
    const model = createProvider(modelInfo.credentials)(modelInfo.modelId);
    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: `Generate a short, descriptive title (30 chars max) for a conversation that starts with this message: "${firstMessage}". Just return the title, nothing else.`,
        },
      ],
    });

    const title = result.text.trim().replace(/^["']|["']$/g, '');
    return title || null;
  } catch (error) {
    console.error('Failed to generate title:', error);
    return null;
  }
}
