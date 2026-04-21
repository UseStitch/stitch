import os from 'node:os';
import path from 'node:path';

import { resolvePreferredShell } from '@/lib/shell.js';

const SHELL_RULES_REUSE_CONTEXT = `- Do not re-query information already present in prior tool results in the same conversation.`;

const SHELL_RULES_PWSH = `Shell usage rules:
- All bash tool calls run in PowerShell — write PowerShell syntax exclusively.
- Never use cmd.exe idioms: dir /b, del, findstr, type, etc.
- In Where-Object blocks always use the $_ sigil (e.g. $_.Extension, not .Extension).
- Pass multiple paths to Remove-Item with -Path @("a","b") not space-separated args.
- Never wrap commands in \`powershell -Command "..."\` — they already run in PowerShell.
${SHELL_RULES_REUSE_CONTEXT}`;

const SHELL_RULES_CMD = `Shell usage rules:
- All bash tool calls run in cmd.exe — use cmd.exe syntax exclusively.
- Never use PowerShell-specific syntax.
${SHELL_RULES_REUSE_CONTEXT}`;

const SHELL_RULES_MACOS = (shell: string) => `Shell usage rules:
- All bash tool calls run in ${shell} — use POSIX/bash/zsh syntax.
${SHELL_RULES_REUSE_CONTEXT}`;

const SHELL_RULES_LINUX = (shell: string) => `Shell usage rules:
- All bash tool calls run in ${shell} — use POSIX/bash/sh syntax.
${SHELL_RULES_REUSE_CONTEXT}`;

export function buildPromptEnvironment(input?: { userTimezone?: string | null }): string {
  const currentDate = new Date().toISOString().slice(0, 10);
  const preferredShell = resolvePreferredShell().shell;
  const homeDir = os.homedir();
  const userTimezone = input?.userTimezone?.trim() || null;

  const lines = [
    '<env>',
    `Current date: ${currentDate}`,
    ...(userTimezone ? [`User timezone: ${userTimezone}`] : []),
    `Operating system: ${process.platform} ${os.release()}`,
    `Home directory: ${homeDir}`,
    `Preferred shell: ${preferredShell}`,
  ];

  if (process.platform === 'win32') {
    const windowsAppData = process.env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming');
    const windowsLocalAppData = process.env.LOCALAPPDATA ?? path.join(homeDir, 'AppData', 'Local');
    const windowsLocalLow = path.join(homeDir, 'AppData', 'LocalLow');
    const windowsProgramData = process.env.PROGRAMDATA ?? 'C:\\ProgramData';
    const isPwsh = preferredShell.startsWith('pwsh') || preferredShell.startsWith('powershell');
    lines.push('Common app data locations:');
    lines.push(
      `Windows (user): APPDATA=${windowsAppData}; LOCALAPPDATA=${windowsLocalAppData}; LocalLow=${windowsLocalLow}`,
    );
    lines.push(`Windows (machine): PROGRAMDATA=${windowsProgramData}`);
    lines.push(isPwsh ? SHELL_RULES_PWSH : SHELL_RULES_CMD);
  }

  if (process.platform === 'darwin') {
    const macosLibrary = path.join(homeDir, 'Library');
    lines.push('Common app data locations:');
    lines.push(
      `macOS (user): Application Support=${path.join(macosLibrary, 'Application Support')}; Preferences=${path.join(macosLibrary, 'Preferences')}; Caches=${path.join(macosLibrary, 'Caches')}; Logs=${path.join(macosLibrary, 'Logs')}`,
    );
    lines.push('macOS (machine): Application Support=/Library/Application Support');
    lines.push(SHELL_RULES_MACOS(preferredShell));
  }

  if (process.platform === 'linux') {
    const xdgDataHome = process.env.XDG_DATA_HOME ?? path.join(homeDir, '.local', 'share');
    const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config');
    const xdgCacheHome = process.env.XDG_CACHE_HOME ?? path.join(homeDir, '.cache');
    const xdgStateHome = process.env.XDG_STATE_HOME ?? path.join(homeDir, '.local', 'state');
    lines.push('Common app data locations:');
    lines.push(
      `Linux/XDG (user): XDG_DATA_HOME=${xdgDataHome}; XDG_CONFIG_HOME=${xdgConfigHome}; XDG_CACHE_HOME=${xdgCacheHome}; XDG_STATE_HOME=${xdgStateHome}`,
    );
    lines.push(SHELL_RULES_LINUX(preferredShell));
  }

  lines.push('</env>');
  return lines.join('\n');
}
