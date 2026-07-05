import { desc, eq } from 'drizzle-orm';

import { createMeetingNoteTemplateId } from '@stitch/shared/id';
import type {
  ListMeetingNoteTemplatesResponse,
  MeetingNoteTemplate,
  MeetingNoteTemplateInput,
  MeetingNoteTemplateResponse,
} from '@stitch/shared/recordings/types';

import { getDb } from '@/db/client.js';
import { meetingNoteTemplates } from '@/db/schema/recordings.js';
import { err, ok } from '@/lib/service-result.js';
import type { ServiceResult } from '@/lib/service-result.js';

type MeetingNoteTemplateRow = typeof meetingNoteTemplates.$inferSelect;

export const PREBUILT_MEETING_NOTE_TEMPLATES: MeetingNoteTemplate[] = [
  {
    id: 'mnt_prebuilt_executive_summary',
    name: 'Executive Summary',
    content:
      '# Executive Summary\n\n## Summary\n- \n\n## Key Decisions\n- \n\n## Action Items\n- [ ] Owner: Task\n\n## Risks and Blockers\n- \n',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'mnt_prebuilt_product_review',
    name: 'Product Review',
    content:
      '# Product Review Notes\n\n## Goals Discussed\n- \n\n## Customer Insights\n- \n\n## Decisions\n- \n\n## Follow-ups\n- [ ] \n',
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'mnt_prebuilt_standup',
    name: 'Team Standup',
    content: '# Standup Notes\n\n## Progress\n- \n\n## Today\n- \n\n## Blockers\n- \n\n## Help Needed\n- \n',
    createdAt: 0,
    updatedAt: 0,
  },
];

function toMeetingNoteTemplate(row: MeetingNoteTemplateRow): MeetingNoteTemplate {
  return { id: row.id, name: row.name, content: row.content, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export function seedMeetingNoteTemplates(db = getDb()): void {
  const now = Date.now();

  for (const template of PREBUILT_MEETING_NOTE_TEMPLATES) {
    db.insert(meetingNoteTemplates)
      .values({ id: template.id, name: template.name, content: template.content, createdAt: now, updatedAt: now })
      .onConflictDoNothing()
      .run();
  }
}

export async function listMeetingNoteTemplates(): Promise<ServiceResult<ListMeetingNoteTemplatesResponse>> {
  const db = getDb();
  const rows = await db.select().from(meetingNoteTemplates).orderBy(desc(meetingNoteTemplates.updatedAt));

  return ok({ templates: rows.map(toMeetingNoteTemplate) });
}

export async function getMeetingNoteTemplate(
  id: MeetingNoteTemplate['id'],
): Promise<ServiceResult<MeetingNoteTemplateResponse>> {
  const db = getDb();
  const [row] = await db.select().from(meetingNoteTemplates).where(eq(meetingNoteTemplates.id, id));

  if (!row) return err('Meeting note template not found', 404);

  return ok({ template: toMeetingNoteTemplate(row) });
}

export async function createMeetingNoteTemplate(
  input: MeetingNoteTemplateInput,
): Promise<ServiceResult<MeetingNoteTemplateResponse>> {
  const db = getDb();
  const now = Date.now();
  const id = createMeetingNoteTemplateId();
  const [row] = await db
    .insert(meetingNoteTemplates)
    .values({ id, name: input.name.trim(), content: input.content, createdAt: now, updatedAt: now })
    .returning();

  if (!row) return err('Failed to create meeting note template', 500);

  return ok({ template: toMeetingNoteTemplate(row) });
}

export async function updateMeetingNoteTemplate(
  id: MeetingNoteTemplate['id'],
  input: MeetingNoteTemplateInput,
): Promise<ServiceResult<MeetingNoteTemplateResponse>> {
  const db = getDb();
  const [row] = await db
    .update(meetingNoteTemplates)
    .set({ name: input.name.trim(), content: input.content, updatedAt: Date.now() })
    .where(eq(meetingNoteTemplates.id, id))
    .returning();

  if (!row) return err('Meeting note template not found', 404);

  return ok({ template: toMeetingNoteTemplate(row) });
}

export async function deleteMeetingNoteTemplate(id: MeetingNoteTemplate['id']): Promise<ServiceResult<void>> {
  const db = getDb();
  const rows = await db
    .delete(meetingNoteTemplates)
    .where(eq(meetingNoteTemplates.id, id))
    .returning({ id: meetingNoteTemplates.id });

  if (rows.length === 0) return err('Meeting note template not found', 404);

  return ok(undefined);
}
