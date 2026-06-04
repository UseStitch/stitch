import { ipcMain, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function registerFilesHandlers(): void {
  ipcMain.handle('files:writeTmp', async (_event, data: ArrayBuffer, ext: string) => {
    const dir = join(tmpdir(), 'stitch-paste');
    await mkdir(dir, { recursive: true });
    const filename = `${randomUUID()}.${ext}`;
    const filePath = join(dir, filename);
    await writeFile(filePath, Buffer.from(data));
    return filePath;
  });

  ipcMain.handle('dialog:openPath', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
    });
    return result.canceled ? [] : result.filePaths;
  });
}
