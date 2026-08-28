import type { Message, StoredPart } from '@stitch/shared/chat/messages';

import * as Log from '@/lib/log.js';
import { compactToolResultOutput, isToolResultError } from '@/llm/context-budget.js';
import { HistoryMessagesEmptyError } from '@/llm/errors.js';
import { renderSystemPrompt } from '@/llm/prompt/assembly.js';
import type { PromptConfig } from '@/llm/prompt/assembly.js';
import type { ModelMessage } from 'ai';

const log = Log.create({ service: 'history-messages' });

const PRESERVE_RECENT_ASSISTANT_TURNS = 3;
const IMAGE_PRUNED_PLACEHOLDER = '[Image already processed by model]';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function buildBackgroundTaskResultText(parts: StoredPart[]): string {
  const tasks = parts
    .filter((part) => part.type === 'background-task-result')
    .flatMap((part) => part.tasks)
    .map(
      (task) => `  <task id="${escapeXml(task.taskId)}" state="${task.state}">
    <summary>Background task ${task.state}: ${escapeXml(task.title)}</summary>
    <task_result>${escapeXml(task.text)}</task_result>
  </task>`,
    );

  if (tasks.length === 0) return '';
  return `<background_tasks>
${tasks.join('\n')}
</background_tasks>

The background task results above arrived after the conversation may have progressed.
Use the current conversation state. Summarize relevant findings for the user and continue the task.
Do not repeat work already completed in later messages.`;
}

type ProviderOptions = NonNullable<ModelMessage['providerOptions']>;
type StoredPartWithProviderOptions = StoredPart & {
  providerMetadata?: ProviderOptions;
  providerOptions?: ProviderOptions;
  callProviderMetadata?: ProviderOptions;
};

function getPartProviderOptions(part: StoredPart): ProviderOptions | undefined {
  const withProviderOptions = part as StoredPartWithProviderOptions;
  return (
    withProviderOptions.providerOptions ??
    withProviderOptions.providerMetadata ??
    withProviderOptions.callProviderMetadata
  );
}

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

      const text = msg.parts
        .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
        .map((p) => p.text)
        .join('');
      const backgroundTaskText = buildBackgroundTaskResultText(msg.parts);
      const modelText = [text, backgroundTaskText].filter(Boolean).join('\n\n');

      const imageParts = msg.parts.filter((p): p is StoredPart & { type: 'user-image' } => p.type === 'user-image');
      const fileParts = msg.parts.filter((p): p is StoredPart & { type: 'user-file' } => p.type === 'user-file');
      const textFileParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'user-text-file' } => p.type === 'user-text-file',
      );

      const hasAttachments = imageParts.length > 0 || fileParts.length > 0 || textFileParts.length > 0;

      if (!modelText && !hasAttachments) continue;

      if (!hasAttachments) {
        llmMessages.push({ role: 'user', content: modelText });
        continue;
      }

      type UserContentPart =
        | { type: 'text'; text: string }
        | { type: 'image'; image: string; mediaType?: string }
        | { type: 'file'; data: string; mediaType: string; filename?: string };

      const content: UserContentPart[] = [];

      if (modelText) {
        content.push({ type: 'text', text: modelText });
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
      const text = msg.parts
        .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
        .map((p) => p.text)
        .join('');
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

  if (llmMessages.at(0)?.role !== 'system') {
    llmMessages.unshift({ role: 'system', content: renderSystemPrompt(promptConfig) });
  }

  return llmMessages;
}
