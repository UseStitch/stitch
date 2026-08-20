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

    expect(result.templates.map((template) => template.id).toSorted()).toEqual(
      PREBUILT_MEETING_NOTE_TEMPLATES.map((template) => template.id).toSorted(),
    );
  });

  test('does not overwrite edited prebuilt templates when seeded again', async () => {
    const template = PREBUILT_MEETING_NOTE_TEMPLATES[0];
    await updateMeetingNoteTemplate(template.id, { name: 'Edited Template', content: '# Edited' });

    seedMeetingNoteTemplates();

    const result = await listMeetingNoteTemplates();
    const edited = result.templates.find((item) => item.id === template.id);

    expect(edited?.name).toBe('Edited Template');
    expect(edited?.content).toBe('# Edited');
  });

  test('creates updates and deletes templates', async () => {
    const created = await createMeetingNoteTemplate({ name: 'Custom Template', content: '# Custom' });

    const updated = await updateMeetingNoteTemplate(created.template.id, {
      name: 'Updated Template',
      content: '# Updated',
    });

    expect(updated.template.name).toBe('Updated Template');
    expect(updated.template.content).toBe('# Updated');

    await deleteMeetingNoteTemplate(created.template.id);

    const result = await listMeetingNoteTemplates();
    expect(result.templates.some((template) => template.id === created.template.id)).toBe(false);
  });
});
