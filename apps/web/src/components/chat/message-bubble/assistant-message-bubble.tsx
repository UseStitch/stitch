import { toUserFacingStreamError } from '@stitch/shared/chat/errors';
import type { StreamErrorDetails } from '@stitch/shared/chat/errors';
import type { StoredPart } from '@stitch/shared/chat/messages';

import { extractTextFromParts } from './extract-text';
import { buildDisplaySegments, collectToolResults } from './segment-utils';
import {
  AssistantBubbleWrapper,
  FileBlock,
  InterruptedLabel,
  MessageCopyButton,
} from './shared-components';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { ErrorPanel } from '@/components/chat/error-panel';
import { LiquidUi } from '@/components/chat/liquid-ui/renderer.js';
import { ReasoningBlock } from '@/components/chat/message-bubble/reasoning-block.js';
import { SourceChip } from '@/components/chat/message-bubble/source-chip.js';
import { buildStoredToolCallDisplayItems } from '@/components/chat/message-bubble/tool-call-display.js';
import { ToolCallGroup } from '@/components/chat/message-bubble/tool-call-group.js';

type AssistantMessageBubbleProps = {
  parts: StoredPart[];
  finishReason?: string | null;
  onAbortTool?: () => void;
};

export function AssistantMessageBubble({
  parts,
  finishReason,
  onAbortTool,
}: AssistantMessageBubbleProps) {
  const segments = buildDisplaySegments(parts);
  const resultsByCallId = collectToolResults(parts);
  const text = extractTextFromParts(parts);
  const wasAborted = finishReason === 'aborted';
  const hadError = finishReason === 'error';

  const streamErrorPart = hadError
    ? (parts.find((part) => part.type === 'stream-error') as
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
        <ErrorPanel
          title={userFacingError.title}
          message={userFacingError.message}
          suggestion={userFacingError.suggestion}
        />
      )}

      {segments.map((segment) => {
        switch (segment.type) {
          case 'text':
            return <ChatMarkdown key={segment.key} text={segment.text} />;
          case 'reasoning':
            return <ReasoningBlock key={segment.key} text={segment.text} />;
          case 'tool-call-group':
            return (
              <ToolCallGroup
                key={segment.key}
                calls={buildStoredToolCallDisplayItems(segment.parts, resultsByCallId, wasAborted)}
                onAbort={onAbortTool}
              />
            );
          case 'liquid-ui':
            return <LiquidUi key={segment.key} spec={segment.part.input} />;
          case 'other': {
            const part = segment.part;
            switch (part.type) {
              case 'tool-result':
                return null;
              case 'source':
                if (part.sourceType === 'url') {
                  return <SourceChip key={segment.key} url={part.url} title={part.title} />;
                }
                return null;
              case 'file':
                return <FileBlock key={segment.key} mediaType={part.file.mediaType} />;
              default:
                return null;
            }
          }
        }
      })}

      {wasAborted && <InterruptedLabel />}

      {text && (
        <div className="flex items-center justify-start opacity-0 transition-opacity group-hover:opacity-100">
          <MessageCopyButton text={text} />
        </div>
      )}
    </AssistantBubbleWrapper>
  );
}
