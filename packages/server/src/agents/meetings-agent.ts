import { eq } from 'drizzle-orm';

import {
  createAgentId,
  createAgentPermissionId,
  createAgentSubAgentId,
  createAgentToolId,
} from '@stitch/shared/id';

import type { Db } from '@/db/client.js';
import * as schema from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { PATHS } from '@/lib/paths.js';

const log = Log.create({ service: 'meetings-agent' });

export const MEETINGS_AGENT_KIND = 'meetings' as const;

const MEETINGS_AGENT_NAME = 'Meetings Agent';

const MEETINGS_AGENT_SYSTEM_PROMPT = `You are the Meetings Agent — a specialized assistant for reviewing meeting recordings and transcriptions.

Your capabilities:
- Query meeting metadata (list meetings, filter by status, get details)
- Query transcription data (summaries, full transcripts, titles)
- Read and search files within the recordings directory

You CANNOT modify any files or data. You have read-only access.
You CANNOT access files outside the recordings directory.

When asked about meetings, start by listing recent meetings and their transcription status.
When asked about a specific meeting, provide its metadata and transcription summary.
When asked for details, use the read/grep tools to examine transcript files in the recordings directory.`;

/**
 * Disabled stitch tools for the Meetings Agent.
 * The agent only gets: read, glob, grep, meetings_list, meetings_transcriptions, question.
 */
const MEETINGS_AGENT_DISABLED_TOOLS = ['bash', 'edit', 'write', 'webfetch'] as const;

function hasMeetingsAgent(db: Db): boolean {
  const rows = db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.kind, MEETINGS_AGENT_KIND))
    .all();

  return rows.length > 0;
}

export function seedMeetingsAgent(db: Db): void {
  if (hasMeetingsAgent(db)) return;

  try {
    db.transaction((tx) => {
      const subAgentId = createAgentId();
      const now = Date.now();

      // 1. Create the Meetings Agent
      tx.insert(schema.agents)
        .values({
          id: subAgentId,
          name: MEETINGS_AGENT_NAME,
          type: 'sub',
          kind: MEETINGS_AGENT_KIND,
          isDeletable: false,
          useBasePrompt: false,
          systemPrompt: MEETINGS_AGENT_SYSTEM_PROMPT,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      // 2. Link it to all existing primary agents
      const primaryAgents = tx
        .select({ id: schema.agents.id })
        .from(schema.agents)
        .where(eq(schema.agents.type, 'primary'))
        .all();

      for (const primary of primaryAgents) {
        tx.insert(schema.agentSubAgents)
          .values({
            id: createAgentSubAgentId(),
            agentId: primary.id,
            subAgentId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // 3. Disable tools the Meetings Agent should not have
      for (const toolName of MEETINGS_AGENT_DISABLED_TOOLS) {
        tx.insert(schema.agentTools)
          .values({
            id: createAgentToolId(),
            agentId: subAgentId,
            toolType: 'stitch',
            toolName,
            enabled: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // 4. Set up permissions
      const recordingsDir = PATHS.dirPaths.recordings;
      const recordingsPattern = `${recordingsDir}*`;

      // Allow read/glob/grep within the recordings directory
      for (const toolName of ['read', 'glob', 'grep'] as const) {
        tx.insert(schema.agentPermissions)
          .values({
            id: createAgentPermissionId(),
            agentId: subAgentId,
            toolName,
            permission: 'allow',
            pattern: recordingsPattern,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }

      // Allow meetings_list, meetings_transcriptions, and question globally
      for (const toolName of ['meetings_list', 'meetings_transcriptions', 'question'] as const) {
        tx.insert(schema.agentPermissions)
          .values({
            id: createAgentPermissionId(),
            agentId: subAgentId,
            toolName,
            permission: 'allow',
            pattern: null,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });

    log.info('seeded Meetings Agent');
  } catch (error) {
    log.error({ error }, 'failed to seed Meetings Agent');
  }
}
