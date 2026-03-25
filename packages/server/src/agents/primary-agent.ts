import { eq } from 'drizzle-orm';

import { createAgentId, createAgentPermissionId } from '@stitch/shared/id';

import type { Db } from '@/db/client.js';
import * as schema from '@/db/schema.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'primary-agent' });

function hasPrimaryAgent(db: Db): boolean {
  const rows = db
    .select({ id: schema.agents.id })
    .from(schema.agents)
    .where(eq(schema.agents.kind, 'primary'))
    .all();

  return rows.length > 0;
}

export function seedPrimaryAgent(db: Db): void {
  if (hasPrimaryAgent(db)) return;

  try {
    db.transaction((tx) => {
      const id = createAgentId();

      tx.insert(schema.agents)
        .values({
          id,
          name: 'My Assistant',
          type: 'primary',
          kind: 'primary',
          isDeletable: false,
        })
        .run();

      tx.insert(schema.agentPermissions)
        .values({
          id: createAgentPermissionId(),
          agentId: id,
          toolName: 'question',
          permission: 'allow',
          pattern: null,
        })
        .run();

      tx.insert(schema.userSettings)
        .values({
          key: 'agent.default',
          value: id,
        })
        .run();
    });

    log.info('seeded primary agent');
  } catch (error) {
    log.error({ error }, 'failed to seed primary agent');
  }
}
