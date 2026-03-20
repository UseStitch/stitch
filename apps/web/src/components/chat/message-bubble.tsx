import { FileIcon, FileTextIcon, GitForkIcon } from 'lucide-react';
import * as React from 'react';

import { toUserFacingStreamError } from '@stitch/shared/chat/errors';
import type { StreamErrorDetails } from '@stitch/shared/chat/errors';
import type { StoredPart } from '@stitch/shared/chat/messages';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';
import { ReasoningBlock } from '@/components/chat/message-bubble/reasoning-block.js';
import { SourceChip } from '@/components/chat/message-bubble/source-chip.js';
import { ToolCallBlock } from '@/components/chat/message-bubble/tool-call-block.js';
import type { StreamingPart } from '@/stores/stream-store';

export { CompactionDivider } from '@/components/chat/message-bubble/compaction-divider.js';

// ─── Interrupted label ────────────────────────────────────────────────────────

function InterruptedLabel() {
  return <p className="text-xs text-muted-foreground/60 mt-1">Interrupted</p>;
}

// ─── File block ───────────────────────────────────────────────────────────────

function FileBlock({ mediaType }: { mediaType: string }) {
  return (
    <div className="my-2 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/25 px-3 py-1.5 text-xs text-muted-foreground">
      <FileIcon className="size-3 shrink-0" />
      <span>{mediaType}</span>
    </div>
  );
}

// ─── Shared wrapper ───────────────────────────────────────────────────────────

function AssistantBubbleWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-start">
      <div className="w-full space-y-1.5">{children}</div>
    </div>
  );
}

// ─── Stored parts grouping ────────────────────────────────────────────────────

type TextSegment = { type: 'text'; text: string; key: string };
type ReasoningSegment = { type: 'reasoning'; text: string; key: string };
type OtherSegment = { type: 'other'; part: StoredPart; key: string };
type DisplaySegment = TextSegment | ReasoningSegment | OtherSegment;

type StoredToolResult = StoredPart & { type: 'tool-result' };

function collectToolResults(parts: StoredPart[]): Map<string, StoredToolResult> {
  const map = new Map<string, StoredToolResult>();
  for (const part of parts) {
    if (part.type === 'tool-result') {
      map.set(part.toolCallId, part as StoredToolResult);
    }
  }
  return map;
}

function buildDisplaySegments(parts: StoredPart[]): DisplaySegment[] {
  const segments: DisplaySegment[] = [];

  for (const part of parts) {
    if (part.type === 'tool-result') continue;

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

  return segments;
}

// ─── Persisted message bubble ─────────────────────────────────────────────────

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  parts: StoredPart[];
  finishReason?: string | null;
  onAbortTool?: () => void;
  onSplit?: () => void;
};

export const MessageBubble = React.memo(function MessageBubble({
  role,
  parts,
  finishReason,
  onAbortTool,
  onSplit,
}: MessageBubbleProps) {
  if (role === 'user') {
    const text = extractTextFromParts(parts);
    const imageParts = parts.filter(
      (p): p is StoredPart & { type: 'user-image' } => p.type === 'user-image',
    );
    const fileParts = parts.filter(
      (p): p is StoredPart & { type: 'user-file' } => p.type === 'user-file',
    );
    const textFileParts = parts.filter(
      (p): p is StoredPart & { type: 'user-text-file' } => p.type === 'user-text-file',
    );
    const hasAttachments =
      imageParts.length > 0 || fileParts.length > 0 || textFileParts.length > 0;

    return (
      <div className="group flex justify-end">
        <div className="max-w-[80%] space-y-2">
          {hasAttachments && (
            <div className="flex flex-wrap gap-2 justify-end">
              {imageParts.map((p) => (
                <div
                  key={p.id}
                  className="size-20 rounded-lg overflow-hidden border border-white/20 shadow-sm bg-primary/20"
                >
                  {p.dataUrl ? (
                    <img src={p.dataUrl} alt={p.filename} className="size-full object-cover" />
                  ) : (
                    <div className="size-full flex items-center justify-center">
                      <FileIcon className="size-5 text-primary-foreground/50" />
                    </div>
                  )}
                </div>
              ))}
              {fileParts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-primary/20 border border-primary/30 max-w-48"
                >
                  <FileIcon className="size-3.5 shrink-0 text-primary-foreground/70" />
                  <span className="text-xs text-primary-foreground/90 truncate">{p.filename}</span>
                </div>
              ))}
              {textFileParts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-primary/20 border border-primary/30 max-w-48"
                >
                  <FileTextIcon className="size-3.5 shrink-0 text-primary-foreground/70" />
                  <span className="text-xs text-primary-foreground/90 truncate">{p.filename}</span>
                </div>
              ))}
            </div>
          )}
          {text && (
            <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
              <p className="whitespace-pre-wrap">{text}</p>
            </div>
          )}
          {onSplit && (
            <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={onSplit}
                title="Split from here"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <GitForkIcon className="size-3" />
                Split
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const segments = buildDisplaySegments(parts);
  const resultsByCallId = collectToolResults(parts);
  const wasAborted = finishReason === 'aborted';
  const hadError = finishReason === 'error';

  const streamErrorPart = hadError
    ? (parts.find((p) => p.type === 'stream-error') as
        | (StoredPart & { type: 'stream-error'; error: string; details?: StreamErrorDetails })
        | undefined)
    : undefined;

  const userFacingError = streamErrorPart
    ? toUserFacingStreamError({ error: streamErrorPart.error, details: streamErrorPart.details })
    : hadError && segments.length === 0
      ? {
          title: 'Request failed',
          message: 'The request failed. Check your model and provider settings and try again.',
        }
      : undefined;

  return (
    <AssistantBubbleWrapper>
      {userFacingError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <p className="font-medium">{userFacingError.title}</p>
          <p>{userFacingError.message}</p>
          {userFacingError.suggestion ? (
            <p className="mt-1 text-xs text-destructive/80">{userFacingError.suggestion}</p>
          ) : null}
        </div>
      )}
      {segments.map((seg) => {
        switch (seg.type) {
          case 'text':
            return <ChatMarkdown key={seg.key} text={seg.text} />;
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
                const missingResult = !result;
                const status = missingResult || isError ? 'error' : 'completed';

                let toolError: string | undefined;
                if (isError) {
                  const rawError = (output as { error?: unknown }).error;
                  toolError = typeof rawError === 'string' ? rawError : String(rawError);
                } else if (missingResult) {
                  toolError = wasAborted ? 'Interrupted' : 'Blocked or failed before completion';
                }

                return (
                  <ToolCallBlock
                    key={seg.key}
                    toolName={part.toolName}
                    status={status}
                    args={part.input}
                    result={output}
                    error={toolError}
                    onAbort={onAbortTool}
                  />
                );
              }
              case 'tool-result':
                return null;
              case 'source':
                if (part.sourceType === 'url') {
                  return <SourceChip key={seg.key} url={part.url} title={part.title} />;
                }
                return null;
              case 'file':
                return <FileBlock key={seg.key} mediaType={part.file.mediaType} />;
              default:
                return null;
            }
          }
        }
      })}
      {wasAborted && <InterruptedLabel />}
    </AssistantBubbleWrapper>
  );
});

// ─── Streaming message bubble ─────────────────────────────────────────────────

type StreamingMessageBubbleProps = {
  partIds: string[];
  parts: Record<string, StreamingPart>;
  onAbortTool?: () => void;
};

export const StreamingMessageBubble = React.memo(function StreamingMessageBubble({
  partIds,
  parts,
  onAbortTool,
}: StreamingMessageBubbleProps) {
  const visibleIds = partIds.filter((id) => id in parts);

  const hasAnyContent = visibleIds.some((partId) => {
    const part = parts[partId];
    if (!part) return false;
    if (part.type === 'text' || part.type === 'reasoning') {
      return part.hasContent;
    }
    return true;
  });

  if (!hasAnyContent) {
    return null;
  }

  return (
    <AssistantBubbleWrapper>
      {visibleIds.map((partId) => {
        const part = parts[partId];
        if (!part) return null;

        switch (part.type) {
          case 'text':
            return (
              <div key={partId}>
                <ChatMarkdown text={part.text} />
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
            return (
              <ToolCallBlock
                key={partId}
                toolName={part.toolName}
                status={part.status}
                args={part.input}
                result={part.output}
                error={part.error ?? undefined}
                onAbort={onAbortTool}
              />
            );
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
    </AssistantBubbleWrapper>
  );
});
