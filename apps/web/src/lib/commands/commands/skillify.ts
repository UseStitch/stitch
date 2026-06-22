import type { SlashCommand } from '../types.js';

export const skillifyCommand: SlashCommand = {
  kind: 'prompt',
  name: 'skillify',
  aliases: ['create-skill'],
  description: 'Turn this conversation into a reusable skill',
  isAvailable: (ctx) => ctx.sessionId !== null && !ctx.isStreaming,
  buildPrompt: (args) => {
    const description = args.trim();
    return [
      'Use the skillify skill to capture this session\'s repeatable process as a reusable skill.',
      '',
      description ? `User description: ${description}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  },
};
