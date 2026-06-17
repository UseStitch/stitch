import { registerIpcHandler } from './register.js';

import type { ElectronBrowserManager } from '../browser-manager.js';

export function registerBrowserHandlers(manager: ElectronBrowserManager): void {
  registerIpcHandler('browser:getState', () => manager.getState());
  registerIpcHandler('browser:registerWebview', (_event, webContentsId, sessionId) =>
    manager.registerWebview(webContentsId, sessionId),
  );
  registerIpcHandler('browser:switchSession', (_event, sessionId) =>
    manager.switchSession(sessionId),
  );
  registerIpcHandler('browser:show', () => manager.requestShow());
  registerIpcHandler('browser:hide', () => manager.getState());
  registerIpcHandler('browser:userNavigate', (_event, url) => manager.userNavigate(url));
  registerIpcHandler('browser:goBack', () => manager.userGoBack());
  registerIpcHandler('browser:goForward', () => manager.userGoForward());
  registerIpcHandler('browser:reload', () => manager.userReload());
  registerIpcHandler('browser:newTab', async (_event, url) => {
    await manager.execute({ action: 'newTab', url });
    return manager.getState();
  });
  registerIpcHandler('browser:focusTab', async (_event, tabId) => {
    await manager.execute({ action: 'focusTab', tabId });
    return manager.getState();
  });
  registerIpcHandler('browser:closeTab', async (_event, tabId) => {
    await manager.execute({ action: 'closeTab', tabId });
    return manager.getState();
  });
  registerIpcHandler('browser:recordHumanInput', () => manager.recordHumanInput());
}
