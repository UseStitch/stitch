import { describe, expect, it } from 'vitest';

import { buildGoogleToolsets } from '../toolsets.js';

describe('buildGoogleToolsets', () => {
  it('exposes gmail label read tools with gmail readonly scope', () => {
    const gmail = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
      capabilities: ['google.gmail.read', 'google.gmail.write'],
    }).find((toolset) => toolset.id === 'google-gmail');

    expect(gmail?.tools().map((tool) => tool.name)).toEqual([
      'gmail_search',
      'gmail_read',
      'gmail_list_labels',
      'gmail_get_label',
    ]);
  });

  it('exposes gmail modify tools only with gmail.modify scope', () => {
    const sendOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      capabilities: ['google.gmail.read', 'google.gmail.write'],
    }).find((toolset) => toolset.id === 'google-gmail');

    const modify = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/gmail.modify'],
      capabilities: ['google.gmail.read', 'google.gmail.write'],
    }).find((toolset) => toolset.id === 'google-gmail');

    expect(sendOnly?.tools().map((tool) => tool.name)).toEqual([
      'gmail_search',
      'gmail_read',
      'gmail_send',
      'gmail_list_labels',
      'gmail_get_label',
    ]);

    expect(modify?.tools().map((tool) => tool.name)).toEqual([
      'gmail_search',
      'gmail_read',
      'gmail_send',
      'gmail_list_labels',
      'gmail_get_label',
      'gmail_modify_labels',
      'gmail_modify_messages',
    ]);
  });

  it('includes docs toolset when docs read scope and capability are present', () => {
    const toolsets = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
      capabilities: ['google.docs.read'],
    });

    expect(toolsets.map((toolset) => toolset.id)).toContain('google-docs');
  });

  it('excludes docs toolset when docs capability is missing', () => {
    const toolsets = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
      capabilities: ['google.drive.read'],
    });

    expect(toolsets.map((toolset) => toolset.id)).not.toContain('google-docs');
  });

  it('only exposes docs write tools when docs write access exists', () => {
    const readOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents.readonly'],
      capabilities: ['google.docs.read', 'google.docs.write'],
    }).find((toolset) => toolset.id === 'google-docs');

    const writable = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/documents'],
      capabilities: ['google.docs.read', 'google.docs.write'],
    }).find((toolset) => toolset.id === 'google-docs');

    expect(readOnly?.tools().map((tool) => tool.name)).toEqual(['docs_search', 'docs_read']);
    expect(writable?.tools().map((tool) => tool.name)).toEqual([
      'docs_search',
      'docs_read',
      'docs_create',
      'docs_update',
      'docs_edit',
    ]);
  });

  it('only exposes calendar write tools when calendar write access exists', () => {
    const readOnly = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      capabilities: ['google.calendar.read', 'google.calendar.write'],
    }).find((toolset) => toolset.id === 'google-calendar');

    const writable = buildGoogleToolsets({
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
      capabilities: ['google.calendar.read', 'google.calendar.write'],
    }).find((toolset) => toolset.id === 'google-calendar');

    expect(readOnly?.tools().map((tool) => tool.name)).toEqual(['calendar_list', 'calendar_get']);
    expect(writable?.tools().map((tool) => tool.name)).toEqual([
      'calendar_list',
      'calendar_get',
      'calendar_create',
      'calendar_update',
      'calendar_delete',
    ]);
  });
});
