import os from 'node:os';
import path from 'node:path';

import { resolvePreferredShell } from '@/lib/shell.js';

export function buildPromptEnvironment(modelId: string): string {
  const currentDate = new Date().toISOString();
  const preferredShell = resolvePreferredShell().shell;
  const homeDir = os.homedir();

  const windowsAppData = process.env.APPDATA ?? path.join(homeDir, 'AppData', 'Roaming');
  const windowsLocalAppData = process.env.LOCALAPPDATA ?? path.join(homeDir, 'AppData', 'Local');
  const windowsLocalLow = path.join(homeDir, 'AppData', 'LocalLow');
  const windowsProgramData = process.env.PROGRAMDATA ?? 'C:\\ProgramData';

  const macosLibrary = path.join(homeDir, 'Library');
  const xdgDataHome = process.env.XDG_DATA_HOME ?? path.join(homeDir, '.local', 'share');
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? path.join(homeDir, '.config');
  const xdgCacheHome = process.env.XDG_CACHE_HOME ?? path.join(homeDir, '.cache');
  const xdgStateHome = process.env.XDG_STATE_HOME ?? path.join(homeDir, '.local', 'state');

  return [
    '<env>',
    `Current date: ${currentDate}`,
    `Model id: ${modelId}`,
    `Operating system: ${process.platform} ${os.release()}`,
    `Home directory: ${homeDir}`,
    `Preferred shell: ${preferredShell}`,
    'Common app data locations:',
    `Windows (user): APPDATA=${windowsAppData}; LOCALAPPDATA=${windowsLocalAppData}; LocalLow=${windowsLocalLow}`,
    `Windows (machine): PROGRAMDATA=${windowsProgramData}`,
    `macOS (user): Application Support=${path.join(macosLibrary, 'Application Support')}; Preferences=${path.join(macosLibrary, 'Preferences')}; Caches=${path.join(macosLibrary, 'Caches')}; Logs=${path.join(macosLibrary, 'Logs')}`,
    'macOS (machine): Application Support=/Library/Application Support',
    `Linux/XDG (user): XDG_DATA_HOME=${xdgDataHome}; XDG_CONFIG_HOME=${xdgConfigHome}; XDG_CACHE_HOME=${xdgCacheHome}; XDG_STATE_HOME=${xdgStateHome}`,
    '</env>',
  ].join('\n');
}
