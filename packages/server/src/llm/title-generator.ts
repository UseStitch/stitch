import { generateText } from 'ai';

import { mapAIError } from '@/lib/ai-error-mapper.js';
import * as Log from '@/lib/log.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { createProvider } from '@/provider/provider.js';
import type { LanguageModelUsage } from 'ai';

const log = Log.create({ service: 'title-generator' });

const generateTitlePrompt = (firstMessage: string) => `
Generate a short, descriptive title (30 chars max) for a conversation that starts with this message: 
"${firstMessage}". 
Just return the title, nothing else.
`;

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
): Promise<GeneratedTitle | null> {
  const resolved = await resolveCheapModel({
    settingsKey: 'model.title',
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
          content: generateTitlePrompt(firstMessage),
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
