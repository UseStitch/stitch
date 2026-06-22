import * as React from 'react';

import { useQueryClient } from '@tanstack/react-query';

import type { ModelSpec } from '@/components/chat/chat-input-parts/types';
import type { TextareaCompletionGroup } from '@/components/ui/textarea-completions';
import { parseSlashCommand } from '@/lib/commands/parse';
import { buildSlashCompletionGroup, findCommand } from '@/lib/commands/registry';
import type { CommandContext } from '@/lib/commands/types';
import { useRequestCompaction } from '@/lib/queries/chat';

type UseSlashCommandsOptions = {
  sessionId: string | null;
  selectedModel: ModelSpec | null;
  isStreaming: boolean;
  setInput: (value: string) => void;
};

type UseSlashCommandsResult = {
  completionGroups: TextareaCompletionGroup[];
  /**
   * Runs the input as a slash command when it matches a registered, available
   * command. Returns true when handled (caller should skip the normal send),
   * false otherwise (caller should send the input as a normal message).
   */
  tryRun: (input: string) => Promise<boolean>;
};

export function useSlashCommands({
  sessionId,
  selectedModel,
  isStreaming,
  setInput,
}: UseSlashCommandsOptions): UseSlashCommandsResult {
  const queryClient = useQueryClient();
  const requestCompaction = useRequestCompaction();

  const buildContext = React.useCallback(
    (): CommandContext => ({
      sessionId,
      selectedModel,
      isStreaming,
      setInput,
      queryClient,
      actions: {
        requestCompaction: async (id: string) => {
          await requestCompaction.mutateAsync(id);
        },
      },
    }),
    [sessionId, selectedModel, isStreaming, setInput, queryClient, requestCompaction],
  );

  const completionGroups = React.useMemo(
    () => [buildSlashCompletionGroup(buildContext())],
    [buildContext],
  );

  const tryRun = React.useCallback(
    async (input: string): Promise<boolean> => {
      const parsed = parseSlashCommand(input);
      if (!parsed) return false;

      const command = findCommand(parsed.name);
      if (!command) return false;

      const ctx = buildContext();
      if (command.isAvailable && !command.isAvailable(ctx)) return false;

      await command.run(parsed.args, ctx);
      return true;
    },
    [buildContext],
  );

  return { completionGroups, tryRun };
}
