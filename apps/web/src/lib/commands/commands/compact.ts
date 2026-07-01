import type { SlashCommand } from '../types.js';

export const compactCommand: SlashCommand = {
  kind: 'client',
  name: 'compact',
  aliases: ['summarize'],
  description: 'Summarize the conversation so far to reclaim context space',
  isAvailable: (ctx) => ctx.sessionId !== null && !ctx.isStreaming,
  run: async (_args, ctx) => {
    if (!ctx.sessionId) return;
    await ctx.actions.requestCompaction(ctx.sessionId);
  },
};
