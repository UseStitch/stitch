import type { SlashCommand } from '../types.js';

export const generateAutomationCommand: SlashCommand = {
  kind: 'client',
  name: 'automation',
  aliases: ['generate-automation'],
  description: 'Generate an automation draft from this conversation',
  isAvailable: (ctx) => ctx.sessionId !== null && !ctx.isStreaming,
  run: async (_args, ctx) => {
    await ctx.actions.generateAutomation();
  },
};
