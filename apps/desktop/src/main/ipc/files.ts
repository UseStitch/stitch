import { dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { registerIpcHandler } from './register.js';

export function registerFilesHandlers(): void {
  registerIpcHandler('files:writeTmp', async (_event, data, ext) => {
    const dir = join(tmpdir(), 'stitch-paste');
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(dir, filename);
    await writeFile(filePath, Buffer.from(data));
    return filePath;
  });

  registerIpcHandler('dialog:openPath', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });
}
