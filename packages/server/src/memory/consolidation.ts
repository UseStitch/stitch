import { generateText, Output } from 'ai';

import type {
  MemoryConsolidationResult,
  ManagedMemoryEntry,
  MemoryFileSnapshot,
  MemoryTarget,
} from '@stitch/shared/memory/types';

import { internalBus } from '@/lib/internal-bus.js';
import * as Log from '@/lib/log.js';
import { createProvider } from '@/llm/provider/provider.js';
import { resolveCheapModel } from '@/llm/resolve-cheap-model.js';
import { memoryFileStore, type CuratedEntryInput, type MemoryFileStore } from '@/memory/file-store.js';
import { buildConsolidationPrompt, consolidationSchema, type ConsolidationProposal } from '@/memory/prompts.js';

const log = Log.create({ service: 'memory-consolidation' });
const MAX_CANDIDATE_CHARACTERS = 20_000;

type ConsolidationCheckpoint = {
  processedDailyHashes: Record<string, string>;
  processedCandidateIds: string[];
  lastRun: MemoryConsolidationResult;
};

type ValidationInput = {
  proposal: ConsolidationProposal;
  memory: MemoryFileSnapshot;
  user: MemoryFileSnapshot;
  candidates: ManagedMemoryEntry[];
};

let maintenanceQueue = Promise.resolve();

export function noopResult(summary: string, lastRunAt: string): MemoryConsolidationResult {
  return { status: 'noop', lastRunAt, summary, candidateCount: 0, promotedCount: 0, rejectedCount: 0 };
}

function formatEntries(entries: ManagedMemoryEntry[]): string {
  return JSON.stringify(
    entries.map(({ id, content, origin, observed, source, target }) => ({
      id,
      content,
      origin,
      observed,
      source,
      target,
    })),
  );
}

function validateDocument(
  target: MemoryTarget,
  proposed: ConsolidationProposal['memory'],
  existing: ManagedMemoryEntry[],
  candidates: Map<string, ManagedMemoryEntry>,
  dispositions: Map<string, ConsolidationProposal['dispositions'][number]>,
): CuratedEntryInput[] {
  const existingById = new Map(existing.map((entry) => [entry.id, entry]));
  const removed = existing.filter((entry) => !proposed.some((item) => item.id === entry.id)).length;
  if (existing.length > 0 && removed / existing.length > 0.25) {
    throw new Error(`${target} proposal removes more than 25% of existing entries`);
  }

  return proposed.map((entry) => {
    const current = existingById.get(entry.id);
    if (current) {
      if (entry.origin !== current.origin || entry.observed !== current.observed || entry.source !== current.source) {
        throw new Error(`Existing entry metadata changed: ${entry.id}`);
      }
    } else {
      const candidate = candidates.get(entry.id);
      const disposition = dispositions.get(entry.id);
      if (!candidate || entry.candidateId !== candidate.id)
        throw new Error(`New entry lacks eligible candidate: ${entry.id}`);
      if (candidate.target !== target || disposition?.target !== target) {
        throw new Error(`Candidate target changed without an explicit disposition: ${entry.id}`);
      }
      if (
        entry.origin !== candidate.origin ||
        entry.observed !== candidate.observed ||
        entry.source !== candidate.source
      ) {
        throw new Error(`Candidate provenance changed: ${entry.id}`);
      }
    }
    if (!entry.content.trim() || entry.content.length > 1_000) throw new Error(`Invalid entry content: ${entry.id}`);
    return {
      id: entry.id,
      content: entry.content.trim(),
      origin: entry.origin,
      observed: entry.observed,
      source: entry.source,
    };
  });
}

export function validateConsolidationProposal(input: ValidationInput): {
  memory: CuratedEntryInput[];
  user: CuratedEntryInput[];
  promotedCount: number;
  rejectedCount: number;
} {
  const allEntries = [...input.proposal.memory, ...input.proposal.user];
  const ids = new Set(allEntries.map((entry) => entry.id));
  if (ids.size !== allEntries.length) throw new Error('Proposed memory entry IDs are not unique');

  const candidates = new Map(input.candidates.map((entry) => [entry.id, entry]));
  const dispositions = new Map(input.proposal.dispositions.map((item) => [item.candidateId, item]));
  if (dispositions.size !== input.proposal.dispositions.length)
    throw new Error('Candidate dispositions are not unique');
  if (input.candidates.some((candidate) => !dispositions.has(candidate.id))) {
    throw new Error('Every eligible candidate requires a disposition');
  }
  if ([...dispositions.keys()].some((id) => !candidates.has(id)))
    throw new Error('Disposition cites an ineligible candidate');

  const memory = validateDocument('memory', input.proposal.memory, input.memory.entries, candidates, dispositions);
  const user = validateDocument('user', input.proposal.user, input.user.entries, candidates, dispositions);
  const promotedIds = new Set(
    [...input.proposal.memory, ...input.proposal.user]
      .filter((entry) => entry.candidateId && candidates.has(entry.candidateId))
      .map((entry) => entry.candidateId),
  );
  return { memory, user, promotedCount: promotedIds.size, rejectedCount: input.candidates.length - promotedIds.size };
}

async function eligibleCandidates(
  store: MemoryFileStore,
  checkpoint: ConsolidationCheckpoint | null,
  curatedIds: Set<string>,
  maxCandidates: number,
): Promise<{
  candidates: ManagedMemoryEntry[];
  dailyHashes: Record<string, string>;
  eligibleIdsByFile: Record<string, string[]>;
  changed: boolean;
}> {
  const paths = await store.listDailyFiles();
  const snapshots = await Promise.all(paths.map((filePath) => store.readFile(filePath)));
  const dailyHashes = Object.fromEntries(snapshots.map((snapshot) => [snapshot.name, snapshot.contentHash]));
  const processedIds = new Set(checkpoint?.processedCandidateIds ?? []);
  const eligibleIdsByFile: Record<string, string[]> = {};
  const changed = snapshots.some(
    (snapshot) => checkpoint?.processedDailyHashes[snapshot.name] !== snapshot.contentHash,
  );
  let characters = 0;
  const candidates: ManagedMemoryEntry[] = [];
  for (const snapshot of snapshots) {
    if (checkpoint?.processedDailyHashes[snapshot.name] === snapshot.contentHash) continue;
    const eligibleIds: string[] = [];
    for (const entry of snapshot.entries) {
      if (
        entry.origin !== 'user' ||
        !entry.source.startsWith('ses_') ||
        entry.source === 'consolidation' ||
        curatedIds.has(entry.id)
      ) {
        continue;
      }
      eligibleIds.push(entry.id);
      if (
        processedIds.has(entry.id) ||
        candidates.length >= maxCandidates ||
        characters + entry.content.length > MAX_CANDIDATE_CHARACTERS
      ) {
        continue;
      }
      candidates.push(entry);
      characters += entry.content.length;
    }
    eligibleIdsByFile[snapshot.name] = eligibleIds;
  }
  return { candidates, dailyHashes, eligibleIdsByFile, changed };
}

function nextCheckpoint(
  previous: ConsolidationCheckpoint | null,
  pending: Awaited<ReturnType<typeof eligibleCandidates>>,
  handledIds: string[],
  result: MemoryConsolidationResult,
): ConsolidationCheckpoint {
  const processedCandidateIds = [...new Set([...(previous?.processedCandidateIds ?? []), ...handledIds])];
  const processed = new Set(processedCandidateIds);
  const processedDailyHashes = { ...previous?.processedDailyHashes };
  for (const [filePath, eligibleIds] of Object.entries(pending.eligibleIdsByFile)) {
    if (eligibleIds.every((id) => processed.has(id)))
      processedDailyHashes[filePath] = pending.dailyHashes[filePath] ?? '';
  }
  return { processedDailyHashes, processedCandidateIds, lastRun: result };
}

function auditMarkdown(result: MemoryConsolidationResult): string {
  return `## ${result.lastRunAt} - ${result.status}\n\n${result.summary}\n\n- Candidates: ${result.candidateCount}\n- Promoted: ${result.promotedCount}\n- Rejected/no-op: ${result.rejectedCount}`;
}

async function recordRejected(
  store: MemoryFileStore,
  result: MemoryConsolidationResult,
): Promise<MemoryConsolidationResult> {
  await store
    .appendConsolidationLog(auditMarkdown(result))
    .catch((error) => log.warn({ error }, 'failed to append rejected consolidation audit'));
  return result;
}

export async function consolidateMemories(
  options: {
    store?: MemoryFileStore;
    maxCandidates?: number;
    propose?: (prompt: string) => Promise<ConsolidationProposal>;
  } = {},
): Promise<MemoryConsolidationResult> {
  const previous = maintenanceQueue;
  let release = (): void => undefined;
  maintenanceQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;

  const store = options.store ?? memoryFileStore;
  const lastRunAt = new Date().toISOString();
  try {
    const [memory, user, checkpoint] = await Promise.all([
      store.readCurated('memory'),
      store.readCurated('user'),
      store.readConsolidationState<ConsolidationCheckpoint>(),
    ]);
    const curatedIds = new Set([...memory.entries, ...user.entries].map((entry) => entry.id));
    const pending = await eligibleCandidates(store, checkpoint, curatedIds, options.maxCandidates ?? 50);
    if (!pending.changed) {
      return noopResult('Daily memory files have not changed since the last consolidation.', lastRunAt);
    }
    if (pending.candidates.length === 0) {
      const result = noopResult('No eligible user-origin candidates were found.', lastRunAt);
      await store.writeConsolidationState(nextCheckpoint(checkpoint, pending, [], result));
      await store.appendConsolidationLog(auditMarkdown(result));
      return result;
    }

    const prompt = buildConsolidationPrompt({
      memory: formatEntries(memory.entries),
      user: formatEntries(user.entries),
      candidates: formatEntries(pending.candidates),
    });
    let proposal: ConsolidationProposal;
    if (options.propose) {
      proposal = await options.propose(prompt);
    } else {
      const resolved = await resolveCheapModel({
        providerIdKey: 'model.title.providerId',
        modelIdKey: 'model.title.modelId',
        fallbackProviderId: '',
        fallbackModelId: '',
      });
      if (!resolved) {
        return recordRejected(store, {
          status: 'rejected',
          lastRunAt,
          summary: 'No model is available for consolidation.',
          candidateCount: pending.candidates.length,
          promotedCount: 0,
          rejectedCount: pending.candidates.length,
        });
      }
      const startedAt = Date.now();
      const generated = await generateText({
        model: createProvider(resolved.credentials)(resolved.modelId),
        output: Output.object({ schema: consolidationSchema }),
        messages: [{ role: 'user', content: prompt }],
      });
      internalBus.emit('usage.memory.completed', {
        providerId: resolved.providerId,
        modelId: resolved.modelId,
        usage: generated.usage,
        phase: 'consolidation',
        startedAt,
        endedAt: Date.now(),
      });
      proposal = generated.output;
    }

    const validated = validateConsolidationProposal({ proposal, memory, user, candidates: pending.candidates });
    await store.rewriteCuratedPair({
      memory: validated.memory,
      user: validated.user,
      memoryHash: memory.contentHash,
      userHash: user.contentHash,
    });
    const result: MemoryConsolidationResult = {
      status: 'accepted',
      lastRunAt,
      summary: proposal.summary,
      candidateCount: pending.candidates.length,
      promotedCount: validated.promotedCount,
      rejectedCount: validated.rejectedCount,
    };
    await store.writeConsolidationState(
      nextCheckpoint(
        checkpoint,
        pending,
        pending.candidates.map((candidate) => candidate.id),
        result,
      ),
    );
    await store.appendConsolidationLog(auditMarkdown(result));
    return result;
  } catch (error) {
    log.warn({ error }, 'memory consolidation rejected');
    return recordRejected(store, {
      status: 'rejected',
      lastRunAt,
      summary: Error.isError(error) ? error.message : 'Unknown consolidation failure',
      candidateCount: 0,
      promotedCount: 0,
      rejectedCount: 0,
    });
  } finally {
    release();
  }
}
