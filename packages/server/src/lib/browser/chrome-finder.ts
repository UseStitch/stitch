import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_NAMES_POSIX = [
  'google-chrome-stable',
  'google-chrome',
  'chromium-browser',
  'chromium',
];

function darwinCandidates(): string[] {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    path.join(
      os.homedir(),
      'Applications',
      'Google Chrome.app',
      'Contents',
      'MacOS',
      'Google Chrome',
    ),
  ];
}

function win32Candidates(): string[] {
  const programFiles = process.env['PROGRAMFILES'] ?? 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local');

  const suffixes = [
    path.join('Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join('Chromium', 'Application', 'chrome.exe'),
  ];

  const candidates: string[] = [];
  for (const base of [programFiles, programFilesX86, localAppData]) {
    for (const suffix of suffixes) {
      candidates.push(path.join(base, suffix));
    }
  }

  return candidates;
}

function linuxCandidates(): string[] {
  const pathValue = process.env.PATH ?? '';
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  const candidates: string[] = [];

  for (const name of CHROME_NAMES_POSIX) {
    for (const dir of dirs) {
      candidates.push(path.join(dir, name));
    }
  }

  return candidates;
}

export function findChrome(): string {
  let candidates: string[];

  if (process.platform === 'darwin') {
    candidates = darwinCandidates();
  } else if (process.platform === 'win32') {
    candidates = win32Candidates();
  } else {
    candidates = linuxCandidates();
  }

  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    `Could not find Chrome or Chromium. Searched:\n${candidates.map((c) => `  - ${c}`).join('\n')}`,
  );
}
