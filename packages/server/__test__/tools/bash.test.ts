import { describe, expect, test } from 'vitest';

import { deriveCommandFamilies, getCommandFamilySuggestion } from '@/tools/bash-families.js';

describe('bash command families', () => {
  test('derives non-technical file listing family', () => {
    expect(deriveCommandFamilies('dir')).toEqual([
      {
        pattern: 'dir *',
        description: 'list files and folders',
      },
    ]);
  });

  test('derives non-technical searching family', () => {
    expect(deriveCommandFamilies('findstr "todo" notes.txt')).toEqual([
      {
        pattern: 'findstr *',
        description: 'search text in files',
      },
    ]);
  });

  test('supports multiple command families in one command string', () => {
    expect(deriveCommandFamilies('dir && copy a.txt b.txt')).toEqual([
      {
        pattern: 'dir *',
        description: 'list files and folders',
      },
      {
        pattern: 'copy *',
        description: 'copy files and folders',
      },
    ]);
  });

  test('returns empty families when command is not in allowlist mapping', () => {
    expect(deriveCommandFamilies('ffmpeg -i input.mp4 output.avi')).toEqual([]);
  });

  test('derives dev tool family', () => {
    expect(deriveCommandFamilies('git status')).toEqual([
      {
        pattern: 'git *',
        description: 'run git commands',
      },
    ]);
  });

  test('suggestion uses plain-language message', () => {
    expect(getCommandFamilySuggestion('mkdir my-folder')).toEqual({
      message: 'Always allow: create folders',
      pattern: 'mkdir *',
    });
  });
});
