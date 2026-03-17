import { describe, expect, test } from 'vitest';

import { inferWindowsShellFromProfile, pickWindowsShell } from '@/lib/shell.js';

describe('shell preferences', () => {
  test('infers pwsh from PowerShell profile metadata', () => {
    expect(
      inferWindowsShellFromProfile({
        name: 'PowerShell',
        source: 'Windows.Terminal.PowershellCore',
      }),
    ).toBe('pwsh');
  });

  test('infers cmd from command prompt profile metadata', () => {
    expect(
      inferWindowsShellFromProfile({
        name: 'Command Prompt',
      }),
    ).toBe('cmd');
  });

  test('returns null for unrelated profile metadata', () => {
    expect(
      inferWindowsShellFromProfile({
        name: 'Ubuntu',
        source: 'Microsoft.WSL',
      }),
    ).toBeNull();
  });

  test('prefers pwsh when available', () => {
    expect(
      pickWindowsShell({
        preferred: 'pwsh',
        hasPwsh: true,
        hasPowershell: true,
        comspec: 'C:\\Windows\\System32\\cmd.exe',
      }),
    ).toBe('pwsh.exe');
  });

  test('falls back to powershell when pwsh is unavailable', () => {
    expect(
      pickWindowsShell({
        preferred: 'pwsh',
        hasPwsh: false,
        hasPowershell: true,
        comspec: 'C:\\Windows\\System32\\cmd.exe',
      }),
    ).toBe('powershell.exe');
  });

  test('uses comspec when cmd is preferred', () => {
    expect(
      pickWindowsShell({
        preferred: 'cmd',
        hasPwsh: true,
        hasPowershell: true,
        comspec: 'C:\\Windows\\System32\\cmd.exe',
      }),
    ).toBe('C:\\Windows\\System32\\cmd.exe');
  });
});
