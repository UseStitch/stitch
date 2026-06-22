import { describe, expect, test } from 'bun:test';

import { buildGoogleToolsets } from './toolsets.js';

function toolNames(toolset: ReturnType<typeof buildGoogleToolsets>[number] | undefined): string[] {
  return toolset?.tools().map((tool) => tool.name) ?? [];
}

describe('buildGoogleToolsets', () => {
  test('exposes gmail label read tools with gmail readonly scope', () => {
    const gmail = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      capabilities: ['google.gmail.read', 'google.gmail.write'],
    }).find((toolset) => toolset.id === 'google-gmail');

    expect(toolNames(gmail)).toEqual(
      expect.arrayContaining([
        'gmail_search',
        'gmail_read',
        'gmail_download_attachments',
        'gmail_list_labels',
        'gmail_get_label',
      ]),
    );
    expect(toolNames(gmail)).not.toContain('gmail_send');
    expect(toolNames(gmail)).not.toContain('gmail_modify_labels');
    expect(toolNames(gmail)).not.toContain('gmail_filters');
  });

  test('exposes gmail modify tools only with gmail.modify scope', () => {
    const sendOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      capabilities: ['google.gmail.read', 'google.gmail.write'],
    }).find((toolset) => toolset.id === 'google-gmail');

    const modify = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      capabilities: ['google.gmail.read', 'google.gmail.write'],
    }).find((toolset) => toolset.id === 'google-gmail');

    expect(toolNames(sendOnly)).toContain('gmail_send');
    expect(toolNames(sendOnly)).not.toContain('gmail_modify_labels');
    expect(toolNames(sendOnly)).not.toContain('gmail_modify_messages');

    expect(toolNames(modify)).toEqual(
      expect.arrayContaining([
        'gmail_send',
        'gmail_modify_labels',
        'gmail_modify_messages',
        'gmail_filters',
      ]),
    );
  });

  test('exposes gmail_filters with gmail.settings.basic scope but not modify tools', () => {
    const settingsOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/gmail.settings.basic'],
      capabilities: ['google.gmail.read', 'google.gmail.write'],
    }).find((toolset) => toolset.id === 'google-gmail');

    expect(toolNames(settingsOnly)).toEqual(
      expect.arrayContaining([
        'gmail_search',
        'gmail_read',
        'gmail_download_attachments',
        'gmail_list_labels',
        'gmail_get_label',
        'gmail_filters',
      ]),
    );
    expect(toolNames(settingsOnly)).not.toContain('gmail_modify_labels');
    expect(toolNames(settingsOnly)).not.toContain('gmail_modify_messages');
  });

  test('includes docs toolset when docs read scope and capability are present', () => {
    const toolsets = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
      capabilities: ['google.docs.read'],
    });

    expect(toolsets.map((toolset) => toolset.id)).toContain('google-docs');
  });

  test('excludes docs toolset when docs capability is missing', () => {
    const toolsets = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
      capabilities: ['google.drive.read'],
    });

    expect(toolsets.map((toolset) => toolset.id)).not.toContain('google-docs');
  });

  test('only exposes docs write tools when docs write access exists', () => {
    const readOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
      capabilities: ['google.docs.read', 'google.docs.write'],
    }).find((toolset) => toolset.id === 'google-docs');

    const writable = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents'],
      capabilities: ['google.docs.read', 'google.docs.write'],
    }).find((toolset) => toolset.id === 'google-docs');

    expect(toolNames(readOnly)).toEqual(expect.arrayContaining(['docs_search', 'docs_read']));
    expect(toolNames(readOnly)).not.toContain('docs_create');
    expect(toolNames(readOnly)).not.toContain('docs_update');
    expect(toolNames(readOnly)).not.toContain('docs_edit');
    expect(toolNames(writable)).toEqual(
      expect.arrayContaining([
        'docs_search',
        'docs_read',
        'docs_create',
        'docs_update',
        'docs_edit',
      ]),
    );
  });

  test('only exposes calendar write tools when calendar write access exists', () => {
    const readOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      capabilities: ['google.calendar.read', 'google.calendar.write'],
    }).find((toolset) => toolset.id === 'google-calendar');

    const writable = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      capabilities: ['google.calendar.read', 'google.calendar.write'],
    }).find((toolset) => toolset.id === 'google-calendar');

    expect(toolNames(readOnly)).toEqual(expect.arrayContaining(['calendar_list', 'calendar_get']));
    expect(toolNames(readOnly)).not.toContain('calendar_create');
    expect(toolNames(readOnly)).not.toContain('calendar_update');
    expect(toolNames(readOnly)).not.toContain('calendar_delete');
    expect(toolNames(writable)).toEqual(
      expect.arrayContaining([
        'calendar_list',
        'calendar_get',
        'calendar_create',
        'calendar_update',
        'calendar_delete',
      ]),
    );
  });

  test('only exposes drive write tools when drive write access exists', () => {
    const readOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      capabilities: ['google.drive.read', 'google.drive.write'],
    }).find((toolset) => toolset.id === 'google-drive');

    const writable = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/drive.file'],
      capabilities: ['google.drive.read', 'google.drive.write'],
    }).find((toolset) => toolset.id === 'google-drive');

    expect(toolNames(readOnly)).toEqual(
      expect.arrayContaining(['drive_search', 'drive_read', 'drive_info']),
    );
    expect(toolNames(readOnly)).not.toContain('drive_write');
    expect(toolNames(readOnly)).not.toContain('drive_upload');
    expect(toolNames(writable)).toEqual(
      expect.arrayContaining([
        'drive_search',
        'drive_read',
        'drive_info',
        'drive_write',
        'drive_upload',
      ]),
    );
  });
});
