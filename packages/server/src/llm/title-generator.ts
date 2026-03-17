import { generateText } from 'ai';

import * as Log from '@/lib/log.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { createProvider } from '@/provider/provider.js';

const log = Log.create({ service: 'title-generator' });

const generateTitlePrompt = (firstMessage: string) => `
Generate a short, descriptive title (30 chars max) for a conversation that starts with this message: 
"${firstMessage}". 
Just return the title, nothing else.
`;

export async function generateTitle(
  firstMessage: string,
  fallbackProviderId: string,
  fallbackModelId: string,
): Promise<string | null> {
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
    return title || null;
  } catch (error) {
    log.error({ error }, 'title generation failed');
    return null;
  }
}
