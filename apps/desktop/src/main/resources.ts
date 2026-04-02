import { app } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

function getResourceDirectories(): string[] {
  return [
    join(app.getAppPath(), 'resources'),
    join(__dirname, '../../resources'),
    join(process.resourcesPath, 'resources'),
    process.resourcesPath,
  ];
}

export function resolveResourcePath(filename: string): string {
  for (const resourceDir of getResourceDirectories()) {
    const candidate = join(resourceDir, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return join(__dirname, '../../resources', filename);
}
