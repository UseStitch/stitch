import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

type WindowsShellPreference = 'pwsh' | 'cmd' | null;

type TerminalProfile = { name?: string; source?: string; commandline?: string };

type TerminalSettings = { defaultProfile?: string; profiles?: { list?: TerminalProfileWithGuid[] } };

type TerminalProfileWithGuid = TerminalProfile & { guid?: string };

type ShellResolution = { shell: string; exe: string; source: string; buildArgv: (command: string) => string[] };

export function buildPowerShellArgv(command: string): string[] {
  const encodedCommand = Buffer.from(command, 'utf16le').toString('base64');
  return ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedCommand];
}

export function buildCmdArgv(command: string): string[] {
  return ['/d', '/s', '/c', command];
}

function buildPosixArgv(command: string): string[] {
  return ['-c', command];
}

export function buildWindowsShellArgv(shell: string, command: string): string[] {
  const lowerShell = shell.toLowerCase();
  if (lowerShell.includes('pwsh') || lowerShell.includes('powershell')) {
    return buildPowerShellArgv(command);
  }

  return buildCmdArgv(command);
}

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
    const shell = pickWindowsShell({
      preferred,
      hasPwsh: commandExists('pwsh.exe'),
      hasPowershell: commandExists('powershell.exe'),
      comspec: process.env.COMSPEC,
    });

    return {
      shell,
      exe: shell,
      source: preferred ? 'windows-terminal-default-profile' : 'windows-fallback',
      buildArgv: (command) => buildWindowsShellArgv(shell, command),
    };
  }

  if (process.env.SHELL && process.env.SHELL.trim().length > 0) {
    return { shell: process.env.SHELL, exe: process.env.SHELL, source: 'process.env.SHELL', buildArgv: buildPosixArgv };
  }

  const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/sh';

  return { shell, exe: shell, source: 'platform-default', buildArgv: buildPosixArgv };
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
