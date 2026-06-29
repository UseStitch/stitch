import type { QueryClient } from '@tanstack/react-query';

import type { ModelSpec } from '@/components/chat/chat-input-parts/types';

/** Server-backed actions a command can invoke, injected by the host hook. */
export type CommandActions = {
  requestCompaction: (sessionId: string) => Promise<void>;
  generateAutomation: () => Promise<void>;
  submitPrompt: (content: string) => Promise<void>;
};

/** Runtime context handed to a command handler when it runs. */
export type CommandContext = {
  /** Current session, or null on the new-session screen. */
  sessionId: string | null;
  /** Model currently selected in the composer, if any. */
  selectedModel: ModelSpec | null;
  /** Whether the session is currently streaming a response. */
  isStreaming: boolean;
  /** Replace the composer input value. */
  setInput: (value: string) => void;
  actions: CommandActions;
  queryClient: QueryClient;
};

/**
 * A command handled in the browser.
 *
 * `kind` discriminates how a command is processed. Only `client` exists today;
 * the field is kept so future kinds (e.g. a command sent on the chat stream)
 * can be added to the union without reshaping callers.
 */
export type ClientCommand = {
  kind: 'client';
  name: string;
  aliases?: string[];
  description: string;
  /**
   * Hides the command from autocomplete and blocks invocation when false.
   * Used to gate commands that require an active session, etc.
   */
  isAvailable?: (ctx: CommandContext) => boolean;
  run: (args: string, ctx: CommandContext) => void | Promise<void>;
};

export type PromptCommand = {
  kind: 'prompt';
  name: string;
  aliases?: string[];
  description: string;
  isAvailable?: (ctx: CommandContext) => boolean;
  buildPrompt: (args: string, ctx: CommandContext) => string;
};

export type SlashCommand = ClientCommand | PromptCommand;
