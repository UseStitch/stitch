import * as React from 'react';
import { FileIcon } from 'lucide-react';
import type { StoredPart } from '@openwork/shared';
import type { StreamingPart } from '@/hooks/sse/use-chat-stream';
import ChatMarkdown from '@/components/chat/chat-markdown';
import { ReasoningBlock } from '@/components/chat/message-bubble/reasoning-block.js';
import { ToolCallBlock } from '@/components/chat/message-bubble/tool-call-block.js';
import { SourceChip } from '@/components/chat/message-bubble/source-chip.js';
import { extractTextFromParts } from '@/components/chat/message-bubble/extract-text.js';

export { CompactionDivider } from '@/components/chat/message-bubble/compaction-divider.js';

// ─── File block ───────────────────────────────────────────────────────────────

function FileBlock({ mediaType }: { mediaType: string }) {
  return (
    <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
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
};

export const MessageBubble = React.memo(function MessageBubble({
  role,
  parts,
}: MessageBubbleProps) {
  if (role === 'user') {
    const text = extractTextFromParts(parts);
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
          <p className="whitespace-pre-wrap">{text}</p>
        </div>
      </div>
    );
  }

  const segments = buildDisplaySegments(parts);
  const resultsByCallId = collectToolResults(parts);

  return (
    <AssistantBubbleWrapper>
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
                return (
                  <ToolCallBlock
                    key={seg.key}
                    toolName={part.toolName}
                    status={isError ? 'error' : 'completed'}
                    args={part.input}
                    result={output}
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
    </AssistantBubbleWrapper>
  );
});

// ─── Streaming message bubble ─────────────────────────────────────────────────

type StreamingMessageBubbleProps = {
  partIds: string[];
  parts: Record<string, StreamingPart>;
  isStreaming: boolean;
};

export const StreamingMessageBubble = React.memo(function StreamingMessageBubble({
  partIds,
  parts,
  isStreaming,
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
