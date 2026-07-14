import { generateText } from 'ai';

import * as Log from '@/lib/log.js';
import { createProvider } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import type { ResolvedModel } from '@/llm/resolve-model.js';
import { mapAIError } from '@/llm/stream/ai-error-mapper.js';
import type { LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'title-generation' });

type GeneratedTitle = { title: string; usage: LanguageModelUsage | null; providerId: string; modelId: string };

type TitleGeneratorDeps = {
  resolveModel?: typeof resolveCheapModel;
  getModel?: (resolved: ResolvedModel) => ReturnType<ReturnType<typeof createProvider>>;
};

export async function generateTitleFromContent(
  content: string,
  fallbackProviderId: string,
  fallbackModelId: string,
  deps?: TitleGeneratorDeps,
): Promise<GeneratedTitle | null> {
  const resolved = await (deps?.resolveModel ?? resolveCheapModel)({
    providerIdKey: 'model.title.providerId',
    modelIdKey: 'model.title.modelId',
    fallbackProviderId,
    fallbackModelId,
  });
  if (!resolved) return null;

  try {
    const model = deps?.getModel ? deps.getModel(resolved) : createProvider(resolved.credentials)(resolved.modelId);
    const result = await generateText({ model, messages: [{ role: 'user', content }] });

    const title = result.text.trim().replace(/^["']|["']$/g, '');
    if (!title) return null;

    return { title, usage: result.usage ?? null, providerId: resolved.providerId, modelId: resolved.modelId };
  } catch (error) {
    const mappedError = mapAIError(error, resolved.providerId);
    log.error(
      { error: mappedError.message, errorCategory: mappedError.category, aiErrorName: mappedError.aiErrorName },
      'title generation failed',
    );
    return null;
  }
}
