import { generateText, Output } from 'ai';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { Message, StoredPart } from '@stitch/shared/chat/messages';
import { createMessageId, createPartId } from '@stitch/shared/id';
import type { PrefixedString } from '@stitch/shared/id';
import type { GeneratedAutomationDraft } from '@stitch/shared/automations/types';

import { getDb } from '@/db/client.js';
import { messages, sessions, userSettings } from '@/db/schema.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';
import { buildHistoryMessages } from '@/llm/history-messages.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { createProvider } from '@/llm/provider/provider.js';
import { listToolsets } from '@/tools/toolsets/registry.js';
import { recordUsageEvent } from '@/usage/ledger.js';
import { calculateMessageCostUsd } from '@/utils/cost.js';

const draftSchema = z.object({
  title: z.string().trim().min(1).max(120),
  toolsets: z.array(z.string().trim().min(1)).max(20),
  steps: z.array(z.string().trim().min(1)).max(20),
  prompt: z.string().trim().min(1),
});

type GenerationMessageContext = Pick<Message, 'providerId' | 'modelId' | 'isSummary'> & {
  parts: StoredPart[];
};

function isHiddenFromHistory(message: GenerationMessageContext): boolean {
  return message.parts.some(
    (part) =>
      part.type === 'session-title' ||
      part.type === 'compaction' ||
      part.type === 'automation-generation',
  );
}

function findLastUsedModel(
  messageList: GenerationMessageContext[],
): { providerId: string; modelId: string } | null {
  for (let index = messageList.length - 1; index >= 0; index--) {
    const message = messageList[index];
    if (!message || message.isSummary || isHiddenFromHistory(message)) continue;
    if (!message.providerId || !message.modelId) continue;
    return { providerId: message.providerId, modelId: message.modelId };
  }

  return null;
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function collectToolsetContext(messageList: GenerationMessageContext[]): {
  usedToolNames: string[];
  inferredToolsets: string[];
  availableToolsets: string[];
} {
  const available = listToolsets();
  const availableToolsets = available.map((toolset) => toolset.id).sort();
  const toolToToolset = new Map<string, string>();

  for (const toolset of available) {
    for (const tool of toolset.tools()) {
      toolToToolset.set(tool.name, toolset.id);
    }
  }

  const toolNames: string[] = [];
  const inferredToolsets = new Set<string>();

  for (const message of messageList) {
    for (const part of message.parts) {
      if (part.type !== 'tool-call') continue;
      toolNames.push(part.toolName);
      const inferred = toolToToolset.get(part.toolName);
      if (inferred) inferredToolsets.add(inferred);
    }
  }

  return {
    usedToolNames: dedupeStrings(toolNames),
    inferredToolsets: [...inferredToolsets].sort(),
    availableToolsets,
  };
}

async function getPromptUserContext(): Promise<{ userName: string | null; userTimezone: string | null }> {
  const db = getDb();
  const rows = await db
    .select({ key: userSettings.key, value: userSettings.value })
    .from(userSettings)
    .where(inArray(userSettings.key, ['profile.name', 'profile.timezone']));
  const byKey = new Map(rows.map((row) => [row.key, row.value.trim()]));

  return {
    userName: byKey.get('profile.name') || null,
    userTimezone: byKey.get('profile.timezone') || null,
  };
}

function buildAutomationPrompt(input: {
  availableToolsets: string[];
  usedToolNames: string[];
  inferredToolsets: string[];
}): string {
  const availableToolsets =
    input.availableToolsets.length > 0 ? input.availableToolsets.join(', ') : '(none registered)';
  const usedToolNames = input.usedToolNames.length > 0 ? input.usedToolNames.join(', ') : '(none)';
  const inferredToolsets = input.inferredToolsets.length > 0 ? input.inferredToolsets.join(', ') : '(none)';

  return [
    'Review the conversation and create an automation draft.',
    'Focus on the user goal and their feedback/corrections so instructions are precise and actionable.',
    'The prompt field must be markdown formatted for readability.',
    '',
    `Known toolsets: ${availableToolsets}`,
    `Observed tool names in this session: ${usedToolNames}`,
    `Inferred toolsets from observed tools: ${inferredToolsets}`,
    '',
    'Rules:',
    '- title: short and descriptive (max 120 chars).',
    '- toolsets: only include toolset IDs that are actually relevant.',
    '- steps: 3-10 concise, ordered steps.',
    '- prompt: clear reusable automation instructions that reflect user feedback and use markdown formatting.',
  ].join('\n');
}

function normalizeDraft(
  draft: z.infer<typeof draftSchema>,
  sessionModel: { providerId: string; modelId: string },
  availableToolsets: string[],
  inferredToolsets: string[],
): GeneratedAutomationDraft {
  const availableSet = new Set(availableToolsets);
  const toolsets = dedupeStrings(draft.toolsets).filter((toolset) => availableSet.has(toolset));

  return {
    title: draft.title.trim(),
    toolsets: toolsets.length > 0 ? toolsets : inferredToolsets,
    steps: dedupeStrings(draft.steps).slice(0, 20),
    prompt: draft.prompt.trim(),
    providerId: sessionModel.providerId,
    modelId: sessionModel.modelId,
  };
}

export async function generateAutomationDraft(
  sessionId: string,
): Promise<ServiceResult<GeneratedAutomationDraft>> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId as PrefixedString<'ses'>));
  if (!session) {
    return err('Session not found', 404);
  }

  const messageList = await db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, session.id))
    .orderBy(asc(messages.createdAt));

  if (messageList.length === 0) {
    return err('Session has no messages to analyze', 400);
  }

  const sessionModel = findLastUsedModel(messageList);
  if (!sessionModel) {
    return err('Unable to determine model for this session', 400);
  }

  const promptUserContext = await getPromptUserContext();
  const toolsetContext = collectToolsetContext(messageList);
  const llmMessages = buildHistoryMessages(messageList, {
    useBasePrompt: false,
    systemPrompt: null,
    userName: promptUserContext.userName,
    userTimezone: promptUserContext.userTimezone,
  });

  const resolved = await resolveCheapModel({
    providerIdKey: 'model.title.providerId',
    modelIdKey: 'model.title.modelId',
    fallbackProviderId: sessionModel.providerId,
    fallbackModelId: sessionModel.modelId,
  });

  if (!resolved) {
    return err('No configured provider found for automation generation', 400);
  }

  const generationMessageId = createMessageId();
  const start = Date.now();
  const model = createProvider(resolved.credentials)(resolved.modelId);

  const result = await generateText({
    model,
    messages: [
      ...llmMessages,
      {
        role: 'user',
        content: buildAutomationPrompt(toolsetContext),
      },
    ],
    maxOutputTokens: 1800,
    output: Output.object({ schema: draftSchema }),
  });

  const draft = normalizeDraft(
    result.output,
    sessionModel,
    toolsetContext.availableToolsets,
    toolsetContext.inferredToolsets,
  );

  const usage = result.usage ?? null;
  const costUsd = usage
    ? await calculateMessageCostUsd({
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        usage,
      })
    : 0;

  const generationPart: StoredPart = {
    type: 'automation-generation',
    id: createPartId(),
    title: draft.title,
    toolsets: draft.toolsets,
    steps: draft.steps,
    prompt: draft.prompt,
    providerId: draft.providerId,
    modelId: draft.modelId,
    startedAt: start,
    endedAt: Date.now(),
  };

  await db.insert(messages).values({
    id: generationMessageId,
    sessionId: session.id,
    role: 'assistant',
    parts: [generationPart],
    modelId: resolved.modelId,
    providerId: resolved.providerId,
    usage: usage ?? undefined,
    costUsd,
    finishReason: 'stop',
    isSummary: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: start,
    duration: Date.now() - start,
  });

  if (usage) {
    await recordUsageEvent({
      runId: generationMessageId,
      source: 'automation_generation',
      status: 'succeeded',
      sessionId: session.id,
      messageId: generationMessageId,
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      usage,
      costUsd,
      metadata: {
        phase: 'automation-generation',
      },
      startedAt: start,
      endedAt: Date.now(),
      durationMs: Date.now() - start,
    });
  }

  return ok(draft);
}
