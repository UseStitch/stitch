/**
 * Bridge between @stitch/google toolset definitions and the server's
 * toolset registry. Queries connector instances for Google, checks scopes,
 * and registers only the toolsets the user has authorized.
 */

import { eq } from 'drizzle-orm';
import type { Tool } from 'ai';

import { buildGoogleToolsets, type GoogleToolsetDefinition } from '@stitch/google/toolsets';
import type { PrefixedString } from '@stitch/shared/id';

import { getDb } from '@/db/client.js';
import { connectorInstances } from '@/db/schema.js';
import * as Log from '@/lib/log.js';
import { registerToolset } from '@/tools/toolsets/registry.js';
import type { Toolset } from '@/tools/toolsets/types.js';

const log = Log.create({ service: 'google-toolsets' });

/** Convert a @stitch/google toolset definition into the server Toolset type. */
function toServerToolset(
  def: GoogleToolsetDefinition,
  instanceId: PrefixedString<'conn'>,
): Toolset {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    instructions: def.instructions,
    tools: () => def.tools(),
    activate: async () => {
      // Fetch the latest access token at activation time
      const db = getDb();
      const [instance] = await db
        .select({ accessToken: connectorInstances.accessToken })
        .from(connectorInstances)
        .where(eq(connectorInstances.id, instanceId));

      if (!instance?.accessToken) {
        throw new Error(`Google connector ${instanceId} has no access token. Re-authorize the connection.`);
      }

      const token = instance.accessToken;
      return def.activate({ getAccessToken: async () => token }) as Record<string, Tool>;
    },
  };
}

/**
 * Register Google toolsets based on connected connector instances.
 * Reads scopes from the DB and only registers toolsets for granted services.
 * Called once at startup.
 */
export async function registerGoogleToolsets(): Promise<void> {
  const db = getDb();

  const instances = await db
    .select()
    .from(connectorInstances)
    .where(eq(connectorInstances.connectorId, 'google'));

  const connected = instances.filter((i) => i.status === 'connected' && i.accessToken);

  if (connected.length === 0) {
    log.info({ event: 'google-toolsets.none' }, 'No connected Google instances, skipping toolset registration');
    return;
  }

  // Use the first connected instance (support for multiple could come later)
  const instance = connected[0];
  const scopes = (instance.scopes as string[]) ?? [];

  const toolsetDefs = buildGoogleToolsets(scopes);

  for (const def of toolsetDefs) {
    registerToolset(toServerToolset(def, instance.id));
  }

  log.info(
    {
      event: 'google-toolsets.registered',
      instanceId: instance.id,
      toolsets: toolsetDefs.map((d) => d.id),
      scopes,
    },
    `Registered ${toolsetDefs.length} Google toolset(s) for ${instance.label ?? instance.id}`,
  );
}
