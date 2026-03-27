import { toUserFacingStreamError } from '@stitch/shared/chat/errors';
import type { StreamErrorDetails } from '@stitch/shared/chat/errors';
import type { StoredPart } from '@stitch/shared/chat/messages';

import ChatMarkdown from '@/components/chat/chat-markdown';
import { ErrorPanel } from '@/components/chat/error-panel';
import { ReasoningBlock } from '@/components/chat/message-bubble/reasoning-block.js';
import { SourceChip } from '@/components/chat/message-bubble/source-chip.js';
import { ToolCallBlock } from '@/components/chat/message-bubble/tool-call-block.js';

import { buildDisplaySegments, collectToolResults } from './segment-utils';
import { AssistantBubbleWrapper, FileBlock, InterruptedLabel } from './shared-components';

type AssistantMessageBubbleProps = {
  parts: StoredPart[];
  finishReason?: string | null;
  onAbortTool?: () => void;
};

export function AssistantMessageBubble({ parts, finishReason, onAbortTool }: AssistantMessageBubbleProps) {
  const segments = buildDisplaySegments(parts);
  const resultsByCallId = collectToolResults(parts);
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
          case 'other': {
            const part = segment.part;
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
                    key={segment.key}
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
    </AssistantBubbleWrapper>
  );
}
