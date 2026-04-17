import { ChevronRightIcon } from 'lucide-react';
import * as React from 'react';
import { Suspense, use } from 'react';

import type { ToolCallStatus } from '@stitch/shared/chat/realtime';

import { ToolCard, getToolCardState } from './card-primitives';

import {
  getHighlighterPromise,
  type SupportedLanguage,
  highlightedCodeCache,
  createHighlightCacheKey,
  estimateHighlightedSize,
} from '@/lib/code-highlighting';
import { cn } from '@/lib/utils';

function getArgs(args: unknown): { code: string | null; description: string | null } {
  const code = (args as { code?: unknown })?.code;
  const description = (args as { description?: unknown })?.description;
  return {
    code: typeof code === 'string' && code.trim().length > 0 ? code.trim() : null,
    description:
      typeof description === 'string' && description.trim().length > 0 ? description.trim() : null,
  };
}

function ShikiCode({ code }: { code: string }) {
  const lang: SupportedLanguage = 'typescript';
  const cacheKey = createHighlightCacheKey(code, lang, 'dual');
  const cached = highlightedCodeCache.get(cacheKey) ?? null;

  if (cached !== null) {
    return (
      <div
        className="chat-markdown-shiki overflow-x-auto text-xs"
        dangerouslySetInnerHTML={{ __html: cached }}
      />
    );
  }

  const highlighter = use(getHighlighterPromise(lang));
  const html = highlighter.codeToHtml(code, {
    lang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
  });

  highlightedCodeCache.set(cacheKey, html, estimateHighlightedSize(html, code));

  return (
    <div
      className="chat-markdown-shiki overflow-x-auto text-xs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function FallbackCode({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto font-mono text-xs break-all whitespace-pre-wrap text-muted-foreground">
      {code}
    </pre>
  );
}

type ExecuteTypescriptToolBlockProps = {
  status: ToolCallStatus;
  args: unknown;
  onAbort?: () => void;
};

export function ExecuteTypescriptToolBlock({
  status,
  args,
  onAbort,
}: ExecuteTypescriptToolBlockProps) {
  const { isActive } = getToolCardState(status);
  const { code, description } = getArgs(args);
  const [open, setOpen] = React.useState(false);

  return (
    <ToolCard.Root status={status}>
      <ToolCard.Header>
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center justify-start gap-2 text-left text-foreground"
        >
          <ToolCard.StatusIndicator status={status} />
          <span className="min-w-0 flex-1 text-left">
            <ToolCard.Title>Codemode</ToolCard.Title>
            {description ? (
              <ToolCard.TitleContent truncate className="mt-1 block">
                {description}
              </ToolCard.TitleContent>
            ) : null}
          </span>
          {code ? (
            <ChevronRightIcon
              className={cn(
                'size-3 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90',
              )}
            />
          ) : null}
        </button>
        <ToolCard.Actions className="self-center">
          {isActive && onAbort ? <ToolCard.StopButton onAbort={onAbort} /> : null}
          {code ? (
            <ToolCard.CopyButton value={code} copyLabel="Copy script" copiedLabel="Copied" />
          ) : null}
        </ToolCard.Actions>
      </ToolCard.Header>

      {code ? (
        <ToolCard.Content open={open} className="p-0">
          <Suspense
            fallback={
              <div className="prose prose-sm max-w-none px-3 py-2 dark:prose-invert">
                <FallbackCode code={code} />
              </div>
            }
          >
            <div className="prose prose-sm max-w-none px-3 py-2 dark:prose-invert">
              <ShikiCode code={code} />
            </div>
          </Suspense>
        </ToolCard.Content>
      ) : null}
    </ToolCard.Root>
  );
}
