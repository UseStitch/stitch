import { describe, expect, test } from 'bun:test';

import {
  ID_PREFIXES,
  createSessionId,
  createMessageId,
  createPartId,
  createToolResultId,
  createQuestionId,
  createPermissionResponseId,
  createPermissionRuleId,
  createMcpServerId,
  createQueuedMessageId,
  createConnectorInstanceId,
  createAutomationId,
  createScheduledJobId,
  createScheduledJobRunId,
  createRecordingId,
  createRecordingAnalysisId,
  createAgendaListId,
  createAgendaItemId,
  createAgendaItemEventId,
  createTodoId,
  createSkillId,
  extractTimestamp,
} from './index';

const ALL_FACTORIES = [
  { create: createSessionId, prefix: ID_PREFIXES.session },
  { create: createMessageId, prefix: ID_PREFIXES.message },
  { create: createPartId, prefix: ID_PREFIXES.part },
  { create: createToolResultId, prefix: ID_PREFIXES.toolResult },
  { create: createQuestionId, prefix: ID_PREFIXES.question },
  { create: createPermissionResponseId, prefix: ID_PREFIXES.permissionResponse },
  { create: createPermissionRuleId, prefix: ID_PREFIXES.permissionRule },
  { create: createMcpServerId, prefix: ID_PREFIXES.mcpServer },
  { create: createQueuedMessageId, prefix: ID_PREFIXES.queuedMessage },
  { create: createConnectorInstanceId, prefix: ID_PREFIXES.connectorInstance },
  { create: createAutomationId, prefix: ID_PREFIXES.automation },
  { create: createScheduledJobId, prefix: ID_PREFIXES.scheduledJob },
  { create: createScheduledJobRunId, prefix: ID_PREFIXES.scheduledJobRun },
  { create: createRecordingId, prefix: ID_PREFIXES.recording },
  { create: createRecordingAnalysisId, prefix: ID_PREFIXES.recordingAnalysis },
  { create: createAgendaListId, prefix: ID_PREFIXES.agendaList },
  { create: createAgendaItemId, prefix: ID_PREFIXES.agendaItem },
  { create: createAgendaItemEventId, prefix: ID_PREFIXES.agendaItemEvent },
  { create: createTodoId, prefix: ID_PREFIXES.todo },
  { create: createSkillId, prefix: ID_PREFIXES.skill },
] as const;

describe('id factories', () => {
  test('covers every prefix in ID_PREFIXES', () => {
    const testedPrefixes = new Set(ALL_FACTORIES.map((f) => f.prefix));
    const allPrefixes = new Set(Object.values(ID_PREFIXES));
    expect(testedPrefixes).toEqual(allPrefixes);
  });

  test('every factory creates an id with the correct prefix and shape', () => {
    for (const { create, prefix } of ALL_FACTORIES) {
      const id = create();
      expect(id.startsWith(`${prefix}_`)).toBe(true);
      const body = id.slice(prefix.length + 1);
      // 12 hex chars (time) + 14 base62 chars (random)
      expect(body).toMatch(/^[0-9a-f]{12}[0-9A-Za-z]{14}$/);
    }
  });

  test('generates unique ids across 100 rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(createSessionId());
    }
    expect(ids.size).toBe(100);
  });
});

describe('extractTimestamp', () => {
  test('returns a positive number', () => {
    const id = createMessageId();
    const extracted = extractTimestamp(id);
    expect(extracted).toBeGreaterThan(0);
  });

  test('ids created later have equal or greater timestamps', async () => {
    const first = createPartId();
    // Wait 2ms to guarantee a new timestamp bucket
    await new Promise((r) => setTimeout(r, 2));
    const second = createPartId();

    expect(extractTimestamp(second)).toBeGreaterThanOrEqual(extractTimestamp(first));
  });
});
