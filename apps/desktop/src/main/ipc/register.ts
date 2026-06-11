import { ipcMain } from 'electron';

import type { IpcContract } from '@stitch/shared/ipc/types';

export function registerIpcHandler<TKey extends keyof IpcContract>(
  channel: TKey,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    ...args: IpcContract[TKey]['args']
  ) => Promise<IpcContract[TKey]['return']> | IpcContract[TKey]['return'],
): void {
  ipcMain.handle(channel, handler as any);
}
