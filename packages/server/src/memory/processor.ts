import { generateText, Output } from 'ai';
import { eq } from 'drizzle-orm';

import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { sessions } from '@/db/schema/sessions.js';
import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { createProvider } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { getMemoryConfig } from '@/memory/config.js';
import { memoryFileStore } from '@/memory/file-store.js';
import { buildExtractionPrompt, extractionSchema } from '@/memory/prompts.js';
import type { MemorySource, MemoryTarget } from '@/memory/types.js';

const log = Log.create({ service: 'memory-capture' });
const SECRET_PATTERN = /(?:api[_ -]?key|access[_ -]?token|password|secret|bearer\s+[a-z0-9._-]+)/i;
const TASK_PATTERN = /\b(?:remind me|todo|to-do|deadline|due (?:today|tomorrow|on)|currently|right now)\b/i;

type Candidate = { content: string; target: MemoryTarget; durability: 'ephemeral' | 'session' | 'long_term' };
type SessionWriteState = { factsWritten: number; lastWriteTurn: number; turnCount: number };
const sessionWriteState = new Map<string, SessionWriteState>();

export function filterCaptureCandidates(candidates: Candidate[], existing: Set<string>, limit: number): Candidate[] {
  const accepted: Candidate[] = [];
  const seen = new Set(existing);
  for (const candidate of candidates) {
    const content = candidate.content.trim();
    const key = `${candidate.target}\0${content.toLocaleLowerCase()}`;
    if (
      candidate.durability !== 'long_term' ||
      content.length < 10 ||
      content.length > 500 ||
      SECRET_PATTERN.test(content) ||
      TASK_PATTERN.test(content) ||
      seen.has(key)
    ) {
      continue;
    }
    seen.add(key);
    accepted.push({ ...candidate, content });
    if (accepted.length >= limit) break;
  }
  return accepted;
}

async function existingCandidateKeys(): Promise<Set<string>> {
  const paths = ['MEMORY.md', 'USER.md', ...(await memoryFileStore.listDailyFiles())];
  const snapshots = await Promise.all(paths.map((filePath) => memoryFileStore.readFile(filePath)));
  return new Set(
    snapshots.flatMap((snapshot) =>
      snapshot.entries.map((entry) => `${entry.target}\0${entry.content.trim().toLocaleLowerCase()}`),
    ),
  );
}

function incrementTurn(sessionId: string): SessionWriteState {
  const state = sessionWriteState.get(sessionId) ?? { factsWritten: 0, lastWriteTurn: -1, turnCount: 0 };
  state.turnCount += 1;
  sessionWriteState.set(sessionId, state);
  return state;
}

export async function processMemories(input: {
  sessionId: string;
  userMessage: string;
  assistantMessage: string;
  providerId: string;
  modelId: string;
  memorySource?: MemorySource;
}): Promise<void> {
  try {
    const config = await getMemoryConfig();
    if (!config.enabled || !config.autoExtract || input.userMessage.trim().length < config.minMessageLength) return;

    const state = incrementTurn(input.sessionId);
    if (
      state.factsWritten >= config.maxFactsPerSession ||
      (config.minTurnsBetweenWrites > 0 &&
        state.lastWriteTurn >= 0 &&
        state.turnCount - state.lastWriteTurn < config.minTurnsBetweenWrites)
    ) {
      return;
    }

    const [resolved, memorySource] = await Promise.all([
      resolveCheapModel({
        providerIdKey: 'model.title.providerId',
        modelIdKey: 'model.title.modelId',
        fallbackProviderId: input.providerId,
        fallbackModelId: input.modelId,
      }),
      resolveMemorySource(input.sessionId, input.memorySource),
    ]);
    if (memorySource === 'automation' && !config.extractFromAutomations) return;
    if (!resolved) return;

    const startedAt = Date.now();
    const result = await generateText({
      model: createProvider(resolved.credentials)(resolved.modelId),
      output: Output.object({ schema: extractionSchema }),
      messages: [{ role: 'user', content: buildExtractionPrompt(input.userMessage, input.assistantMessage) }],
    });
    internalBus.emit('usage.memory.completed', {
      providerId: resolved.providerId,
      modelId: resolved.modelId,
      usage: result.usage,
      phase: 'extraction',
      startedAt,
      endedAt: Date.now(),
    });

    const remaining = Math.min(config.maxFactsPerTurn, config.maxFactsPerSession - state.factsWritten);
    const candidates = filterCaptureCandidates(result.output.candidates, await existingCandidateKeys(), remaining);
    if (candidates.length === 0) return;
    await memoryFileStore.appendDaily(
      candidates.map((candidate) => ({
        content: candidate.content,
        target: candidate.target,
        origin: memorySource === 'automation' ? 'automation' : 'user',
        source: input.sessionId,
      })),
    );
    state.factsWritten += candidates.length;
    state.lastWriteTurn = state.turnCount;
    log.info({ sessionId: input.sessionId, candidateCount: candidates.length }, 'captured daily memory candidates');
  } catch (error) {
    log.error({ error, sessionId: input.sessionId }, 'memory capture failed');
  }
}

async function resolveMemorySource(sessionId: string, override: MemorySource | undefined): Promise<MemorySource> {
  if (override) return override;
  const session = (
    await getDb()
      .select({ type: sessions.type })
      .from(sessions)
      .where(eq(sessions.id, sessionId as PrefixedString<'ses'>))
      .limit(1)
  ).at(0);
  return session?.type === 'automation' ? 'automation' : 'chat';
}
