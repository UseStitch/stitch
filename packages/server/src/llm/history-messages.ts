import type { Message, StoredPart } from '@stitch/shared/chat/messages';

import * as Log from '@/lib/log.js';
import { buildSystemPrompt } from '@/llm/prompt/builder.js';
import { estimate } from '@/utils/token.js';
import type { ModelMessage } from 'ai';

const log = Log.create({ service: 'history-messages' });

const DEFAULT_TOOL_RESULT_BUDGET_TOKENS = 1_000;
const TOOL_RESULT_BUDGET_TOKENS: Record<string, number> = {
  browser: 600,
  webfetch: 700,
  bash: 900,
};
const TOOL_RESULT_PREVIEW_CHARS = 1_600;

function toPreviewText(value: unknown): string {
  if (typeof value === 'string') {
    return value.slice(0, TOOL_RESULT_PREVIEW_CHARS);
  }

  if (value && typeof value === 'object') {
    const output = (value as { output?: unknown }).output;
    if (typeof output === 'string') {
      return output.slice(0, TOOL_RESULT_PREVIEW_CHARS);
    }
  }

  const serialized = JSON.stringify(value);
  return serialized.slice(0, TOOL_RESULT_PREVIEW_CHARS);
}

function compactToolResultOutput(part: StoredPart & { type: 'tool-result' }): unknown {
  const output = part.output;
  const isError =
    output !== null &&
    output !== undefined &&
    typeof output === 'object' &&
    'error' in (output as object);
  if (isError) {
    return output;
  }

  const tokenEstimate = estimate(output);
  const tokenBudget = TOOL_RESULT_BUDGET_TOKENS[part.toolName] ?? DEFAULT_TOOL_RESULT_BUDGET_TOKENS;

  if (tokenEstimate <= tokenBudget) {
    return output;
  }

  return {
    summary: `Tool output compacted for context replay (${tokenEstimate} estimated tokens).`,
    toolName: part.toolName,
    estimatedTokens: tokenEstimate,
    truncated: part.truncated,
    outputPath: part.outputPath ?? null,
    preview: toPreviewText(output),
  };
}

export function buildHistoryMessages(
  msgs: Array<Pick<Message, 'role' | 'parts' | 'isSummary' | 'modelId'>>,
  promptConfig?: { useBasePrompt: boolean; systemPrompt: string | null; userName?: string | null },
): ModelMessage[] {
  if (msgs.length === 0) {
    throw new Error('buildHistoryMessages requires at least one message');
  }

  const llmMessages: ModelMessage[] = [];

  for (const msg of msgs) {
    const hasSessionTitle = msg.parts.some((p) => p.type === 'session-title');
    if (hasSessionTitle) {
      continue;
    }

    if (msg.role === 'user') {
      const hasCompaction = msg.parts.some((p) => p.type === 'compaction');
      if (hasCompaction) continue;

      const text = msg.parts
        .filter((p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta')
        .map((p) => p.text)
        .join('');

      const imageParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'user-image' } => p.type === 'user-image',
      );
      const fileParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'user-file' } => p.type === 'user-file',
      );
      const textFileParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'user-text-file' } => p.type === 'user-text-file',
      );

      const hasAttachments =
        imageParts.length > 0 || fileParts.length > 0 || textFileParts.length > 0;

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

      for (const img of imageParts) {
        const base64 = img.dataUrl.includes(',') ? img.dataUrl.split(',')[1] : img.dataUrl;
        content.push({
          type: 'image',
          image: base64,
          mediaType: img.mime,
        });
      }

      for (const file of fileParts) {
        const base64 = file.dataUrl.includes(',') ? file.dataUrl.split(',')[1] : file.dataUrl;
        content.push({
          type: 'file',
          data: base64,
          mediaType: file.mime,
          filename: file.filename,
        });
      }

      for (const tf of textFileParts) {
        content.push({
          type: 'text',
          text: `<file name="${tf.filename}">\n${tf.content}\n</file>`,
        });
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
      const textParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'text-delta' } => p.type === 'text-delta',
      );
      const toolCallParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'tool-call' } => p.type === 'tool-call',
      );
      const toolResultParts = msg.parts.filter(
        (p): p is StoredPart & { type: 'tool-result' } => p.type === 'tool-result',
      );

      const toolResultById = new Map(toolResultParts.map((part) => [part.toolCallId, part]));
      const matchedToolCalls = toolCallParts.filter((part) => toolResultById.has(part.toolCallId));
      const matchedToolCallIds = new Set(matchedToolCalls.map((part) => part.toolCallId));
      const unmatchedToolCalls = toolCallParts.length - matchedToolCalls.length;

      if (unmatchedToolCalls > 0) {
        log.warn(
          {
            count: unmatchedToolCalls,
          },
          'dropping unmatched tool-call parts from LLM history',
        );
      }

      if (textParts.length > 0 || matchedToolCalls.length > 0) {
        const assistantContent: Array<
          | { type: 'text'; text: string }
          | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
        > = [];

        const combinedText = textParts.map((p) => p.text).join('');
        if (combinedText) {
          assistantContent.push({ type: 'text', text: combinedText });
        }

        for (const tc of matchedToolCalls) {
          assistantContent.push({
            type: 'tool-call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            input: tc.input,
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
              const isError =
                tr.output !== null &&
                tr.output !== undefined &&
                typeof tr.output === 'object' &&
                'error' in (tr.output as object);
              const compactedOutput = compactToolResultOutput(tr);

              return {
                type: 'tool-result' as const,
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                output: isError
                  ? { type: 'error-json' as const, value: compactedOutput as never }
                  : { type: 'json' as const, value: compactedOutput as never },
              };
            }),
        });
      }
    }
  }

  if (llmMessages[0]?.role !== 'system') {
    llmMessages.unshift({
      role: 'system',
      content: buildSystemPrompt({
        useBasePrompt: promptConfig?.useBasePrompt ?? true,
        systemPrompt: promptConfig?.systemPrompt ?? null,
        userName: promptConfig?.userName ?? null,
      }),
    });
  }

  return llmMessages;
}
