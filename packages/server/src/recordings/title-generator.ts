import { generateText } from 'ai';

import * as Log from '@/lib/log.js';
import { createProvider } from '@/llm/provider/provider.js';
import type { ProviderCredentials } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { mapAIError } from '@/llm/stream/ai-error-mapper.js';
import type { LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'recording-title-generator' });

type GeneratedRecordingTitle = {
  title: string;
  usage: LanguageModelUsage | null;
  providerId: string;
  modelId: string;
};

type RecordingTitleGeneratorDeps = {
  resolveModel?: typeof resolveCheapModel;
  getModel?: (resolved: {
    providerId: string;
    modelId: string;
    credentials: ProviderCredentials;
  }) => ReturnType<ReturnType<typeof createProvider>>;
};

function buildRecordingTitlePrompt(analysis: string): string {
  return `
Generate a short, descriptive title (60 chars max) for these meeting notes.
Use neutral language and do not invent details.

Meeting notes:
${analysis}

Return only the title.
`;
}

export async function generateRecordingTitle(
  analysis: string,
  fallbackProviderId: string,
  fallbackModelId: string,
  deps?: RecordingTitleGeneratorDeps,
): Promise<GeneratedRecordingTitle | null> {
  const resolved = await (deps?.resolveModel ?? resolveCheapModel)({
    providerIdKey: 'model.title.providerId',
    modelIdKey: 'model.title.modelId',
    fallbackProviderId,
    fallbackModelId,
  });
  if (!resolved) return null;

  try {
    const model = deps?.getModel ? deps.getModel(resolved) : createProvider(resolved.credentials)(resolved.modelId);
    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: buildRecordingTitlePrompt(analysis),
        },
      ],
    });

    const title = result.text.trim().replace(/^["']|["']$/g, '');
    if (!title) return null;

    return {
      title,
      usage: result.usage ?? null,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
    };
  } catch (error) {
    const mappedError = mapAIError(error, resolved.providerId);
    log.error(
      {
        error: mappedError.message,
        errorCategory: mappedError.category,
        aiErrorName: mappedError.aiErrorName,
      },
      'recording title generation failed',
    );
    return null;
  }
}
