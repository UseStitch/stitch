import { and, asc, eq, isNull } from 'drizzle-orm';

import type { Message, StoredPart } from '@stitch/shared/chat/messages';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { messages, sessions } from '@/db/schema/sessions.js';
import * as Log from '@/lib/log.js';
import { compactToolResultOutput, isToolResultError } from '@/llm/context-budget.js';
import { HistoryMessagesEmptyError } from '@/llm/errors.js';
import { buildSystemPromptLayers, getPromptUserContext, type PromptConfig } from '@/llm/prompt/builder.js';
import { getMemoryConfig } from '@/memory/config.js';
import { buildRetrievalQuery } from '@/memory/query.js';
import { retrieveMemoryContext } from '@/memory/retriever.js';
import { getCachedSessionMemoryContext, setCachedSessionMemoryContext } from '@/memory/session-context-cache.js';
import { getSettings } from '@/settings/service.js';
import { getSessionTodosPromptBlock } from '@/todos/service.js';
import type { ModelMessage } from 'ai';

const log = Log.create({ service: 'session-history' });

const PRESERVE_RECENT_ASSISTANT_TURNS = 3;
const IMAGE_PRUNED_PLACEHOLDER = '[Image already processed by model]';

type ProviderOptions = NonNullable<ModelMessage['providerOptions']>;
type StoredPartWithProviderOptions = StoredPart & {
  providerMetadata?: ProviderOptions;
  providerOptions?: ProviderOptions;
  callProviderMetadata?: ProviderOptions;
};

function extractMessageText(message: { parts: StoredPart[] }): string {
  return extractText(message.parts);
}

function extractText(parts: StoredPart[]): string {
  return parts
    .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
    .map((p) => p.text)
    .join('');
}

function getPartProviderOptions(part: StoredPart): ProviderOptions | undefined {
  const withProviderOptions = part as StoredPartWithProviderOptions;
  return (
    withProviderOptions.providerOptions ??
    withProviderOptions.providerMetadata ??
    withProviderOptions.callProviderMetadata
  );
}

/**
 * Index of the latest summary message, or -1 if none exists. Messages before
 * this boundary are treated as settled history and folded into the summary.
 */
export function findLastSummaryIndex(msgs: Array<Pick<Message, 'isSummary'>>): number {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].isSummary) {
      return i;
    }
  }
  return -1;
}

/**
 * Build the LLM message history for a session, starting from the latest summary boundary.
 */
export async function buildSessionLlmMessages(
  sessionId: PrefixedString<'ses'>,
  promptConfig: Pick<PromptConfig, 'useBasePrompt' | 'systemPrompt'>,
): Promise<ModelMessage[]> {
  const db = getDb();

  const [msgs, promptUserContext, promptSettings, sessionRow, todoContext] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), isNull(messages.archivedAt)))
      .orderBy(asc(messages.createdAt)),
    getPromptUserContext(),
    getSettings(['agents.customInstructions'] as const),
    db.select({ type: sessions.type }).from(sessions).where(eq(sessions.id, sessionId)).limit(1),
    getSessionTodosPromptBlock(sessionId),
  ]);

  // Automations can read all memories; chat only sees 'chat' memories.
  const memorySourceFilter = sessionRow[0]?.type === 'automation' ? undefined : ('chat' as const);

  const startIndex = findLastSummaryIndex(msgs);

  let memoryContext: string | null = null;
  const msgsDesc = [...msgs].reverse();
  const latestUserIndex = msgsDesc.findIndex((m) => m.role === 'user');
  const latestUserMsg = latestUserIndex >= 0 ? msgsDesc[latestUserIndex] : undefined;

  if (latestUserMsg) {
    const userText = extractMessageText(latestUserMsg);

    if (userText.length > 0) {
      const previousAssistantMsg = msgsDesc.slice(latestUserIndex + 1).find((m) => m.role === 'assistant');
      const previousAssistantText = previousAssistantMsg ? extractMessageText(previousAssistantMsg) : null;
      const memoryConfig = await getMemoryConfig();
      const query = buildRetrievalQuery({
        userText,
        previousAssistantText,
        contextAwareQuery: memoryConfig.retrievalContextAwareQuery,
        skipLowSignal: memoryConfig.retrievalSkipLowSignal,
      });

      if (query === null) {
        memoryContext = getCachedSessionMemoryContext(sessionId);
      } else {
        memoryContext = await retrieveMemoryContext(query, memorySourceFilter).catch(() => null);
        if (memoryContext !== null) {
          setCachedSessionMemoryContext(sessionId, memoryContext);
        }
      }
    }
  }

  return buildHistoryMessages(msgs.slice(startIndex), {
    useBasePrompt: promptConfig.useBasePrompt,
    systemPrompt: promptConfig.systemPrompt ?? promptSettings['agents.customInstructions'],
    userName: promptUserContext.userName,
    userTimezone: promptUserContext.userTimezone,
    memoryContext,
    todoContext,
  });
}

/**
 * Transform stored messages into LLM messages, injecting the system prompt and
 * pruning or compressing parts that the model has already processed.
 */
export function buildHistoryMessages(
  msgs: Array<Pick<Message, 'role' | 'parts' | 'isSummary' | 'modelId'>>,
  promptConfig: PromptConfig,
): ModelMessage[] {
  if (msgs.length === 0) {
    throw new HistoryMessagesEmptyError();
  }

  const llmMessages: ModelMessage[] = [];

  let assistantTurnsSeen = 0;
  let attachmentCutoffIndex = 0;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && !msgs[i].isSummary) {
      assistantTurnsSeen++;
      if (assistantTurnsSeen > PRESERVE_RECENT_ASSISTANT_TURNS) {
        attachmentCutoffIndex = i;
        break;
      }
    }
  }

  for (let msgIdx = 0; msgIdx < msgs.length; msgIdx++) {
    const msg = msgs[msgIdx];
    const shouldPruneAttachments = msgIdx < attachmentCutoffIndex;
    const hasSessionTitle = msg.parts.some((p) => p.type === 'session-title');
    if (hasSessionTitle) {
      continue;
    }

    const hasAutomationGeneration = msg.parts.some((p) => p.type === 'automation-generation');
    if (hasAutomationGeneration) {
      continue;
    }

    if (msg.role === 'user') {
      const hasCompaction = msg.parts.some((p) => p.type === 'compaction');
      if (hasCompaction) continue;

      const text = extractText(msg.parts);

      const imageParts = msg.parts.filter((p): p is StoredPart & { type: 'user-image' } => p.type === 'user-image');
      const fileParts = msg.parts.filter((p): p is StoredPart & { type: 'user-file' } => p.type === 'user-file');
      const textFileParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'user-text-file' } => p.type === 'user-text-file',
      );

      const hasAttachments = imageParts.length > 0 || fileParts.length > 0 || textFileParts.length > 0;

      if (!text && !hasAttachments) continue;

      if (!hasAttachments) {
        llmMessages.push({ role: 'user', content: text });
        continue;
      }

      type UserContentPart =
        | { type: 'text'; text: string }
        | { type: 'image'; image: string; mediaType?: string }
        | { type: 'file'; data: string; mediaType: string; filename?: string };

      const content: UserContentPart[] = [];

      if (text) {
        content.push({ type: 'text', text });
      }

      if (shouldPruneAttachments) {
        for (const _img of imageParts) {
          content.push({ type: 'text', text: IMAGE_PRUNED_PLACEHOLDER });
        }
        for (const file of fileParts) {
          const label = file.filename ? `"${file.filename}"` : 'attachment';
          content.push({ type: 'text', text: `[File ${label} already processed by model]` });
        }
      } else {
        for (const img of imageParts) {
          const base64 = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
          content.push({ type: 'image', image: base64, mediaType: img.mime });
        }

        for (const file of fileParts) {
          const base64 = file.dataUrl.includes(',') ? file.dataUrl.split(',')[1] : file.dataUrl;
          content.push({ type: 'file', data: base64, mediaType: file.mime, filename: file.filename });
        }
      }

      for (const tf of textFileParts) {
        content.push({ type: 'text', text: `<file name="${tf.filename}">\n${tf.content}\n</file>` });
      }

      llmMessages.push({ role: 'user', content });
      continue;
    }

    if (msg.role === 'assistant' && msg.isSummary) {
      const text = extractText(msg.parts);
      if (text) {
        llmMessages.push({ role: 'assistant', content: text });
      }
      continue;
    }

    if (msg.role === 'assistant') {
      const textParts = msg.parts.filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta');
      const toolCallParts = msg.parts.filter((p): p is StoredPart & { type: 'tool-call' } => p.type === 'tool-call');
      const toolResultParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result',
      );

      const toolResultById = new Map(toolResultParts.map((part) => [part.toolCallId, part]));
      const matchedToolCalls = toolCallParts.filter((part) => toolResultById.has(part.toolCallId));
      const matchedToolCallIds = new Set(matchedToolCalls.map((part) => part.toolCallId));
      const unmatchedToolCalls = toolCallParts.length - matchedToolCalls.length;

      if (unmatchedToolCalls > 0) {
        log.warn({ count: unmatchedToolCalls }, 'dropping unmatched tool-call parts from LLM history');
      }

      if (textParts.length > 0 || matchedToolCalls.length > 0) {
        const assistantContent: Array<
          | { type: 'text'; text: string }
          | {
              type: 'tool-call';
              toolCallId: string;
              toolName: string;
              input: unknown;
              providerOptions?: ProviderOptions;
            }
        > = [];

        const combinedText = textParts.map((p) => p.text).join('');
        if (combinedText) {
          assistantContent.push({ type: 'text', text: combinedText });
        }

        for (const tc of matchedToolCalls) {
          const providerOptions = getPartProviderOptions(tc);
          assistantContent.push({
            type: 'tool-call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input,
            ...(providerOptions ? { providerOptions } : {}),
          });
        }

        llmMessages.push({ role: 'assistant', content: assistantContent });
      }

      if (matchedToolCallIds.size > 0) {
        llmMessages.push({
          role: 'tool',
          content: toolResultParts
            .filter((tr) => matchedToolCallIds.has(tr.toolCallId))
            .map((tr) => {
              const compactedOutput = compactToolResultOutput(tr);
              const providerOptions = getPartProviderOptions(tr);

              return {
                type: 'tool-result' as const,
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                output: isToolResultError(tr.output)
                  ? { type: 'error-json' as const, value: compactedOutput as never }
                  : { type: 'json' as const, value: compactedOutput as never },
                ...(providerOptions ? { providerOptions } : {}),
              };
            }),
        });
      }
    }
  }

  if (llmMessages[0]?.role !== 'system') {
    const layers = buildSystemPromptLayers(promptConfig);
    const parts = [layers.static, layers.semiStatic];
    if (layers.dynamic) {
      parts.push(layers.dynamic);
    }
    llmMessages.unshift({ role: 'system', content: parts.join('\n\n') });
  }

  return llmMessages;
}
