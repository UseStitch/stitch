import type { TextareaCompletionGroup } from '@/components/ui/textarea-completions';

import { compactCommand } from './commands/compact.js';
import type { CommandContext, SlashCommand } from './types.js';

const COMMANDS: SlashCommand[] = [compactCommand];

export function findCommand(name: string): SlashCommand | null {
  const lowered = name.toLowerCase();
  return (
    COMMANDS.find(
      (command) =>
        command.name === lowered || command.aliases?.some((alias) => alias === lowered),
    ) ?? null
  );
}

function isCommandAvailable(command: SlashCommand, ctx: CommandContext): boolean {
  return command.isAvailable ? command.isAvailable(ctx) : true;
}

/** Builds the `/`-prefixed completion group, filtered to currently available commands. */
export function buildSlashCompletionGroup(ctx: CommandContext): TextareaCompletionGroup {
  return {
    prefix: '/',
    label: 'Commands',
    options: COMMANDS.filter((command) => isCommandAvailable(command, ctx)).map((command) => ({
      value: command.name,
      label: command.name,
      description: command.description,
    })),
  };
}
