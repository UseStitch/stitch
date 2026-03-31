import os from 'node:os';
import path from 'node:path';

import { resolvePreferredShell } from '@/lib/shell.js';

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
    lines.push('Common app data locations:');
    lines.push(
      `Windows (user): APPDATA=${windowsAppData}; LOCALAPPDATA=${windowsLocalAppData}; LocalLow=${windowsLocalLow}`,
    );
    lines.push(`Windows (machine): PROGRAMDATA=${windowsProgramData}`);
  }

  if (process.platform === 'darwin') {
    const macosLibrary = path.join(homeDir, 'Library');
    lines.push('Common app data locations:');
    lines.push(
      `macOS (user): Application Support=${path.join(macosLibrary, 'Application Support')}; Preferences=${path.join(macosLibrary, 'Preferences')}; Caches=${path.join(macosLibrary, 'Caches')}; Logs=${path.join(macosLibrary, 'Logs')}`,
    );
    lines.push('macOS (machine): Application Support=/Library/Application Support');
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
  }

  lines.push('</env>');
  return lines.join('\n');
}
