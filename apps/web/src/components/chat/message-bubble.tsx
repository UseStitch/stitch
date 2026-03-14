import * as React from 'react';
import Markdown, { MarkdownHooks } from 'react-markdown';
import rehypeShiki from '@shikijs/rehype';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Pluggable } from 'unified';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LinkIcon,
  FileIcon,
  CheckIcon,
  AlertCircleIcon,
  LoaderIcon,
  ImageOffIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoredPart } from '@openwork/shared';
import type { StreamingPart } from '@/hooks/use-chat-stream';
import type { ToolCallStatus } from '@openwork/shared';

// ─── Shared markdown renderer ─────────────────────────────────────────────────

const remarkPlugins: Pluggable[] = [remarkGfm, remarkMath];

const rehypePlugins: Pluggable[] = [
  rehypeKatex,
  [rehypeShiki, { themes: { light: 'github-light', dark: 'github-dark' } }],
];

function MarkdownImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [broken, setBroken] = React.useState(false);

  if (broken) {
    return (
      <span className="my-1.5 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <ImageOffIcon className="size-3.5 shrink-0" />
        <span>{props.alt ?? 'Image'}</span>
      </span>
    );
  }

  return <img {...props} onError={() => setBroken(true)} />;
}

const markdownComponents = { img: MarkdownImage };

/**
 * Synchronous markdown renderer (no syntax highlighting).
 *
 * Uses the sync `Markdown` component with only sync plugins so content renders
 * immediately on every update. Used during streaming and as the fallback for
 * `MarkdownContent` while its async rehypeShiki plugin processes.
 */
const syncRehypePlugins: Pluggable[] = [rehypeKatex];

function SyncMarkdownContent({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed',
        className,
      )}
    >
      <Markdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={syncRehypePlugins}
        components={markdownComponents}
      >
        {text}
      </Markdown>
    </div>
  );
}

/**
 * Full markdown renderer with syntax highlighting for persisted messages.
 *
 * Uses `MarkdownHooks` with async rehypeShiki for code block highlighting.
 * The `fallback` prop renders a sync version of the content so text is never
 * blank while the async plugin processes.
 */
function MarkdownContent({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        'prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed',
        className,
      )}
    >
      <MarkdownHooks
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
        fallback={
          <Markdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={syncRehypePlugins}
            components={markdownComponents}
          >
            {text}
          </Markdown>
        }
      >
        {text}
      </MarkdownHooks>
    </div>
  );
}

// ─── Reasoning block ──────────────────────────────────────────────────────────

function ReasoningBlock({ text, isStreaming }: { text: string; isStreaming?: boolean }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="my-3 rounded-lg border border-border/40 bg-muted/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDownIcon className="size-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="size-3.5 shrink-0" />
        )}
        <span className="font-medium">{isStreaming ? 'Thinking...' : 'Reasoning'}</span>
        {isStreaming && (
          <span className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
        )}
      </button>
      {open && (
        <div className="border-t border-border/40 px-3.5 py-3 text-xs leading-relaxed text-muted-foreground italic">
          {text}
        </div>
      )}
    </div>
  );
}

// ─── Tool call block (unified lifecycle) ─────────────────────────────────────

function StatusIcon({ status }: { status: ToolCallStatus }) {
  switch (status) {
    case 'pending':
      return (
        <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground animate-spin" />
      );
    case 'in-progress':
      return <LoaderIcon className="mt-0.5 size-3.5 shrink-0 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />;
    case 'error':
      return <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-destructive" />;
  }
}

function ToolCallBlock({ toolName, status }: { toolName: string; status: ToolCallStatus }) {
  const hasError = status === 'error';
  const isActive = status === 'pending' || status === 'in-progress';

  return (
    <div
      className={cn(
        'my-2 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors',
        hasError
          ? 'border-destructive/40 bg-destructive/5'
          : isActive
            ? 'border-blue-500/30 bg-blue-500/5'
            : 'border-border/40 bg-muted/20',
      )}
    >
      <StatusIcon status={status} />
      <span className="font-medium">{toolName}</span>
    </div>
  );
}

// ─── Source chip ──────────────────────────────────────────────────────────────

function SourceChip({ url, title }: { url: string; title?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-1 mr-1 inline-flex items-center gap-1 rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
    >
      <LinkIcon className="size-2.5 shrink-0" />
      <span className="max-w-45 truncate">{title ?? url}</span>
    </a>
  );
}

// ─── File block ───────────────────────────────────────────────────────────────

function FileBlock({ mediaType }: { mediaType: string }) {
  return (
    <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
      <FileIcon className="size-3 shrink-0" />
      <span>{mediaType}</span>
    </div>
  );
}

// ─── Persisted message bubble ─────────────────────────────────────────────────

type TextSegment = { type: 'text'; text: string; key: string };
type ReasoningSegment = { type: 'reasoning'; text: string; key: string };
type OtherSegment = { type: 'other'; part: StoredPart; key: string };
type DisplaySegment = TextSegment | ReasoningSegment | OtherSegment;

type StoredToolResult = StoredPart & { type: 'tool-result' };

/**
 * Collapses StoredPart[] into display segments.
 * tool-result parts are skipped here — they're returned separately in a lookup
 * map so each tool-call can render its own result inline.
 */
function groupStoredParts(parts: StoredPart[]): {
  segments: DisplaySegment[];
  resultsByCallId: Map<string, StoredToolResult>;
} {
  const segments: DisplaySegment[] = [];
  const resultsByCallId = new Map<string, StoredToolResult>();

  for (const part of parts) {
    // Collect tool-results into the lookup map — don't emit a segment for them
    if (part.type === 'tool-result') {
      resultsByCallId.set(part.toolCallId, part as StoredToolResult);
      continue;
    }

    if (part.type === 'text-delta') {
      const last = segments.at(-1);
      if (last?.type === 'text') {
        last.text += part.text;
      } else {
        segments.push({ type: 'text', text: part.text, key: `text-${segments.length}` });
      }
      continue;
    }

    if (part.type === 'reasoning-delta') {
      const last = segments.at(-1);
      if (last?.type === 'reasoning') {
        last.text += part.text;
      } else {
        segments.push({ type: 'reasoning', text: part.text, key: `reasoning-${segments.length}` });
      }
      continue;
    }

    // Skip structural markers — they carry no display content
    if (
      part.type === 'text-start' ||
      part.type === 'text-end' ||
      part.type === 'reasoning-start' ||
      part.type === 'reasoning-end'
    ) {
      continue;
    }

    segments.push({ type: 'other', part, key: `other-${segments.length}` });
  }

  return { segments, resultsByCallId };
}

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  parts: StoredPart[];
};

export function MessageBubble({ role, parts }: MessageBubbleProps) {
  if (role === 'user') {
    const text = parts
      .filter((p) => p.type === 'text-delta')
      .map((p) => (p as Extract<typeof p, { type: 'text-delta' }>).text)
      .join('');
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  const { segments, resultsByCallId } = groupStoredParts(parts);

  return (
    <div className="flex justify-start">
      <div className="w-full space-y-1.5">
        {segments.map((seg) => {
          switch (seg.type) {
            case 'text':
              return <MarkdownContent key={seg.key} text={seg.text} />;
            case 'reasoning':
              return <ReasoningBlock key={seg.key} text={seg.text} />;
            case 'other': {
              const part = seg.part;
              switch (part.type) {
                case 'tool-call': {
                  const result = resultsByCallId.get(part.toolCallId);
                  const output = result && 'output' in result ? result.output : undefined;
                  const isError =
                    output !== null &&
                    output !== undefined &&
                    typeof output === 'object' &&
                    'error' in (output as object);
                  return (
                    <ToolCallBlock
                      key={seg.key}
                      toolName={part.toolName}
                      status={isError ? 'error' : 'completed'}
                    />
                  );
                }
                case 'tool-result':
                  // Rendered inline with its tool-call above — never reached
                  return null;
                case 'source': {
                  if (part.sourceType === 'url') {
                    return <SourceChip key={seg.key} url={part.url} title={part.title} />;
                  }
                  return null;
                }
                case 'file':
                  return <FileBlock key={seg.key} mediaType={part.file.mediaType} />;
                default:
                  return null;
              }
            }
          }
        })}
      </div>
    </div>
  );
}

// ─── Streaming message bubble ─────────────────────────────────────────────────

type StreamingMessageBubbleProps = {
  partIds: string[];
  parts: Record<string, StreamingPart>;
  isStreaming: boolean;
};

export function StreamingMessageBubble({
  partIds,
  parts,
  isStreaming,
}: StreamingMessageBubbleProps) {
  const visibleIds = partIds.filter((id) => id in parts);

  if (visibleIds.length === 0) {
    if (!isStreaming) return null;
    return (
      <div className="flex justify-start">
        <div className="flex items-center gap-1 px-1 py-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="w-full space-y-1.5">
        {visibleIds.map((partId) => {
          const part = parts[partId];
          if (!part) return null;

          switch (part.type) {
            case 'text':
              return (
                <div key={partId}>
                  <SyncMarkdownContent text={part.text} />
                </div>
              );
            case 'reasoning':
              return (
                <ReasoningBlock
                  key={partId}
                  text={part.text}
                  isStreaming={part.status === 'streaming'}
                />
              );
            case 'tool-call':
              return <ToolCallBlock key={partId} toolName={part.toolName} status={part.status} />;
            case 'source': {
              const src = part.source;
              if (src.sourceType === 'url') {
                return <SourceChip key={partId} url={src.url} title={src.title} />;
              }
              return null;
            }
            case 'file':
              return <FileBlock key={partId} mediaType={part.mediaType} />;
          }
        })}
      </div>
    </div>
  );
}
