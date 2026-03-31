import { generateText } from 'ai';

import * as Log from '@/lib/log.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { mapAIError } from '@/llm/stream/ai-error-mapper.js';
import { createProvider } from '@/provider/provider.js';
import type { LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'title-generator' });

const generateTitlePrompt = (firstMessage: string, filenames: string[] = []) => {
  const normalizedFilenames = filenames.map((name) => name.trim()).filter(Boolean);
  const filenameContext =
    normalizedFilenames.length > 0
      ? `\nAttached filenames:\n${normalizedFilenames.map((name) => `- ${name}`).join('\n')}`
      : '';

  return `
Generate a short, descriptive title (30 chars max) for a conversation.
If attached filenames are provided, prefer using them when they add useful context.

First message:
"${firstMessage}"${filenameContext}

Return only the title.
`;
};

type GeneratedTitle = {
  title: string;
  usage: LanguageModelUsage | null;
  providerId: string;
  modelId: string;
};

export async function generateTitle(
  firstMessage: string,
  fallbackProviderId: string,
  fallbackModelId: string,
  filenames?: string[],
): Promise<GeneratedTitle | null> {
  const resolved = await resolveCheapModel({
    providerIdKey: 'model.title.providerId',
    modelIdKey: 'model.title.modelId',
    fallbackProviderId,
    fallbackModelId,
  });
  if (!resolved) return null;

  try {
    const model = createProvider(resolved.credentials)(resolved.modelId);
    const result = await generateText({
      model,
      messages: [
        {
          role: 'user',
          content: generateTitlePrompt(firstMessage, filenames),
        },
      ],
    });

    const title = result.text.trim().replace(/^["']|["']$/g, '');
    if (!title) {
      return null;
    }

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
      'title generation failed',
    );
    return null;
  }
}
