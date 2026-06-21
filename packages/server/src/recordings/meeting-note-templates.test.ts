import { describe, expect, test } from 'bun:test';

import { setupTestDb } from '@/db/test-helpers.js';
import {
  createMeetingNoteTemplate,
  deleteMeetingNoteTemplate,
  listMeetingNoteTemplates,
  PREBUILT_MEETING_NOTE_TEMPLATES,
  seedMeetingNoteTemplates,
  updateMeetingNoteTemplate,
} from '@/recordings/meeting-note-templates.js';

setupTestDb();

describe('meeting note templates', () => {
  test('seeds prebuilt templates', async () => {
    const result = await listMeetingNoteTemplates();

    expect(result.templates).toHaveLength(PREBUILT_MEETING_NOTE_TEMPLATES.length);
    expect(result.templates.map((template) => template.id).sort()).toEqual(
      PREBUILT_MEETING_NOTE_TEMPLATES.map((template) => template.id).sort(),
    );
  });

  test('does not overwrite edited prebuilt templates when seeded again', async () => {
    const template = PREBUILT_MEETING_NOTE_TEMPLATES[0];
    const updated = await updateMeetingNoteTemplate(template.id, {
      name: 'Edited Template',
      content: '# Edited',
    });

    expect(updated.error).toBeNull();

    seedMeetingNoteTemplates();

    const result = await listMeetingNoteTemplates();
    const edited = result.templates.find((item) => item.id === template.id);

    expect(edited?.name).toBe('Edited Template');
    expect(edited?.content).toBe('# Edited');
  });

  test('creates updates and deletes templates', async () => {
    const created = await createMeetingNoteTemplate({
      name: 'Custom Template',
      content: '# Custom',
    });

    expect(created.error).toBeNull();
    if (created.error) return;

    const updated = await updateMeetingNoteTemplate(created.data.template.id, {
      name: 'Updated Template',
      content: '# Updated',
    });

    expect(updated.error).toBeNull();
    if (updated.error) return;
    expect(updated.data.template.name).toBe('Updated Template');
    expect(updated.data.template.content).toBe('# Updated');

    const deleted = await deleteMeetingNoteTemplate(created.data.template.id);

    expect(deleted.error).toBeNull();

    const result = await listMeetingNoteTemplates();
    expect(result.templates.some((template) => template.id === created.data.template.id)).toBe(
      false,
    );
  });
});
