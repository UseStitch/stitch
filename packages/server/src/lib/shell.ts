import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type WindowsShellPreference = 'pwsh' | 'cmd' | null;

type TerminalProfile = {
  name?: string;
  source?: string;
  commandline?: string;
};

type TerminalSettings = {
  defaultProfile?: string;
  profiles?: {
    list?: TerminalProfileWithGuid[];
  };
};

type TerminalProfileWithGuid = TerminalProfile & {
  guid?: string;
};

type ShellResolution = {
  shell: string;
  source: string;
};

export function inferWindowsShellFromProfile(profile: TerminalProfile): WindowsShellPreference {
  const text = [profile.name, profile.source, profile.commandline]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  if (text.includes('pwsh') || text.includes('powershellcore') || text.includes('powershell')) {
    return 'pwsh';
  }

  if (text.includes('command prompt') || text.includes('cmd.exe') || text.includes('cmd')) {
    return 'cmd';
  }

  return null;
}

export function pickWindowsShell(input: {
  preferred: WindowsShellPreference;
  hasPwsh: boolean;
  hasPowershell: boolean;
  comspec?: string;
}): string {
  if (input.preferred === 'cmd') {
    return input.comspec || 'cmd.exe';
  }

  if (input.hasPwsh) {
    return 'pwsh.exe';
  }

  if (input.hasPowershell) {
    return 'powershell.exe';
  }

  return input.comspec || 'cmd.exe';
}

export function resolvePreferredShell(): ShellResolution {
  if (process.platform === 'win32') {
    const profile = readWindowsTerminalDefaultProfile();
    const preferred = profile ? inferWindowsShellFromProfile(profile) : null;

    return {
      shell: pickWindowsShell({
        preferred,
        hasPwsh: commandExists('pwsh.exe'),
        hasPowershell: commandExists('powershell.exe'),
        comspec: process.env.COMSPEC,
      }),
      source: preferred ? 'windows-terminal-default-profile' : 'windows-fallback',
    };
  }

  if (process.env.SHELL && process.env.SHELL.trim().length > 0) {
    return { shell: process.env.SHELL, source: 'process.env.SHELL' };
  }

  return {
    shell: process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh',
    source: 'platform-default',
  };
}

function readWindowsTerminalDefaultProfile(): TerminalProfile | null {
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');
  const packagesDir = path.join(localAppData, 'Packages');
  const candidates: string[] = [];

  try {
    const packageFolders = fs.readdirSync(packagesDir, { withFileTypes: true });
    for (const folder of packageFolders) {
      if (!folder.isDirectory()) continue;
      if (!folder.name.toLowerCase().startsWith('microsoft.windowsterminal')) continue;
      candidates.push(path.join(packagesDir, folder.name, 'LocalState', 'settings.json'));
    }
  } catch {
    // Ignore and use fallback candidates below.
  }

  for (const settingsPath of candidates) {
    if (!fs.existsSync(settingsPath)) continue;

    try {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      const parsed = JSON.parse(raw) as TerminalSettings;
      if (!parsed.defaultProfile || !Array.isArray(parsed.profiles?.list)) continue;

      const defaultGuid = parsed.defaultProfile.toLowerCase();
      const profile = parsed.profiles.list.find(
        (item) => typeof item.guid === 'string' && item.guid.toLowerCase() === defaultGuid,
      );

      if (profile) {
        return profile;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function commandExists(command: string): boolean {
  if (path.isAbsolute(command)) {
    return fs.existsSync(command);
  }

  const pathValue = process.env.PATH || process.env.Path || '';
  if (pathValue.length === 0) return false;

  const pathEntries = pathValue.split(path.delimiter).filter(Boolean);

  if (process.platform !== 'win32') {
    return pathEntries.some((entry) => fs.existsSync(path.join(entry, command)));
  }

  const extensions = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
    .split(';')
    .map((value) => value.toLowerCase())
    .filter(Boolean);

  const commandLower = command.toLowerCase();
  const hasExtension = extensions.some((extension) => commandLower.endsWith(extension));

  return pathEntries.some((entry) => {
    const direct = path.join(entry, command);
    if (hasExtension && fs.existsSync(direct)) return true;
    return extensions.some((extension) => fs.existsSync(`${direct}${extension}`));
  });
}
