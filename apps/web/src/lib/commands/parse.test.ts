import { describe, expect, test } from 'bun:test';

import { parseSlashCommand } from './parse.js';

describe('parseSlashCommand', () => {
  test('returns null for empty input', () => {
    expect(parseSlashCommand('')).toBeNull();
  });

  test('returns null when there is no leading slash', () => {
    expect(parseSlashCommand('compact')).toBeNull();
  });

  test('returns null when the slash is not the first character', () => {
    expect(parseSlashCommand(' /compact')).toBeNull();
    expect(parseSlashCommand('hey /compact')).toBeNull();
  });

  test('returns null for a lone slash', () => {
    expect(parseSlashCommand('/')).toBeNull();
    expect(parseSlashCommand('/   ')).toBeNull();
  });

  test('parses a command with no arguments', () => {
    expect(parseSlashCommand('/compact')).toEqual({ name: 'compact', args: '' });
  });

  test('lowercases the command name', () => {
    expect(parseSlashCommand('/Compact')).toEqual({ name: 'compact', args: '' });
  });

  test('parses arguments after the command name', () => {
    expect(parseSlashCommand('/rename my new title')).toEqual({
      name: 'rename',
      args: 'my new title',
    });
  });

  test('trims surrounding whitespace from arguments', () => {
    expect(parseSlashCommand('/rename   spaced out   ')).toEqual({
      name: 'rename',
      args: 'spaced out',
    });
  });
});
