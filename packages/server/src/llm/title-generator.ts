import { generateText } from 'ai';

import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { createProvider } from '@/provider/provider.js';

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
    console.error('Failed to generate title:', error);
    return null;
  }
}
