import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolLabel } from './card-primitives';

type SkillToolBlockProps = {
  status: ToolCallStatus;
  args?: unknown;
  result?: unknown;
  error?: string;
};

function getSkillName(args: unknown, result: unknown): string | null {
  const argName = (args as { name?: unknown } | undefined)?.name;
  if (typeof argName === 'string' && argName.trim().length > 0) return argName.trim();

  const resultName = (result as { name?: unknown } | undefined)?.name;
  if (typeof resultName === 'string' && resultName.trim().length > 0) return resultName.trim();

  return null;
}

export function SkillToolBlock({ status, args, result, error }: SkillToolBlockProps) {
  const skillName = getSkillName(args, result);
  const label = getToolLabel(status, error);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <ToolCard.StatusIndicator status={status} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <ToolCard.Title>Skill</ToolCard.Title>
            {skillName ? (
              <span className="rounded-sm border border-border/50 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {skillName}
              </span>
            ) : null}
          </div>
          <ToolCard.TitleContent truncate className="block">
            {label ?? (status === 'completed' ? 'Loaded skill instructions' : 'Loading skill')}
          </ToolCard.TitleContent>
        </div>
      </ToolCard.Header>
    </ToolCard.Root>
  );
}
