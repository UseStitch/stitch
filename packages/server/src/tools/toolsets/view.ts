import { humanizeToolName } from '@stitch/shared/tools/display';

import type { Toolset, ToolsetPrompt } from '@/tools/toolsets/types.js';

type ToolsetViewOptions = { active: boolean; persisted: boolean; includePrompts?: boolean; includeTools?: boolean };

type ToolsetPromptView = { name: string; description?: string; arguments?: ToolsetPrompt['arguments'] };

type ToolsetToolView = { name: string; displayName: string; description: string };

export type ToolsetView = {
  id: string;
  name: string;
  description: string;
  icon: Toolset['icon'] | null;
  active: boolean;
  persisted: boolean;
  hasInstructions: boolean;
  promptCount: number;
  prompts?: ToolsetPromptView[];
  tools?: ToolsetToolView[];
};

export function toToolsetView(toolset: Toolset, options: ToolsetViewOptions): ToolsetView {
  return {
    id: toolset.id,
    name: toolset.name,
    description: toolset.description,
    icon: toolset.icon ?? null,
    active: options.active,
    persisted: options.persisted,
    hasInstructions: !!toolset.instructions,
    promptCount: toolset.prompts?.length ?? 0,
    ...(options.includePrompts && {
      prompts:
        toolset.prompts?.map((prompt) => ({
          name: prompt.name,
          description: prompt.description,
          arguments: prompt.arguments,
        })) ?? [],
    }),
    ...(options.includeTools && {
      tools: toolset
        .tools()
        .map((tool) => ({ name: tool.name, displayName: humanizeToolName(tool.name), description: tool.description })),
    }),
  };
}
