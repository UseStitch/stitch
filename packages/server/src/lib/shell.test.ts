import { describe, expect, test } from 'bun:test';

import {
  buildCmdArgv,
  buildPowerShellArgv,
  buildWindowsShellArgv,
  inferWindowsShellFromProfile,
  pickWindowsShell,
} from '@/lib/shell.js';

describe('shell preferences', () => {
  test('infers pwsh from PowerShell profile metadata', () => {
    expect(inferWindowsShellFromProfile({ name: 'PowerShell', source: 'Windows.Terminal.PowershellCore' })).toBe(
      'pwsh',
    );
  });

  test('infers cmd from command prompt profile metadata', () => {
    expect(inferWindowsShellFromProfile({ name: 'Command Prompt' })).toBe('cmd');
  });

  test('returns null for unrelated profile metadata', () => {
    expect(inferWindowsShellFromProfile({ name: 'Ubuntu', source: 'Microsoft.WSL' })).toBeNull();
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

  test('builds encoded PowerShell argv', () => {
    const command = 'Get-ChildItem -LiteralPath "C:\\Program Files"';
    const argv = buildPowerShellArgv(command);

    expect(argv.slice(0, -1)).toEqual([
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
    ]);
    expect(Buffer.from(argv.at(-1) ?? '', 'base64').toString('utf16le')).toBe(command);
  });

  test('builds cmd argv', () => {
    const command = 'dir "C:\\Program Files"';

    expect(buildCmdArgv(command)).toEqual(['/d', '/s', '/c', command]);
  });

  test('round-trips PowerShell commands with shell-sensitive characters', () => {
    const command = '"quoted value"; $env:Path; Write-Output "a & b"\nWrite-Output done';
    const argv = buildWindowsShellArgv('pwsh.exe', command);

    expect(Buffer.from(argv.at(-1) ?? '', 'base64').toString('utf16le')).toBe(command);
  });

  test('uses cmd argv for non-PowerShell Windows shells', () => {
    const command = 'echo hello';

    expect(buildWindowsShellArgv('cmd.exe', command)).toEqual(['/d', '/s', '/c', command]);
  });
});
