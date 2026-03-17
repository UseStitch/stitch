import { asc } from 'drizzle-orm';

import { getDb } from '@/db/client.js';
import { agents } from '@/db/schema.js';

export async function listAgents() {
  const db = getDb();
  return db.select().from(agents).orderBy(asc(agents.createdAt));
}
