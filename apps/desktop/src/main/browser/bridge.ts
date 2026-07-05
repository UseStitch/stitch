import { WebSocketServer, type WebSocket } from 'ws';

import type {
  ElectronBrowserCommand,
  ElectronBrowserCommandMessage,
} from '@stitch/shared/browser/electron';

import { rawSocketDataToString } from './url.js';

const HOST = '127.0.0.1';

type BrowserCommandHandler = (
  sessionId: string,
  command: ElectronBrowserCommand,
) => Promise<unknown>;

export class BrowserBridge {
  private wss: WebSocketServer | null = null;

  constructor(private readonly handleCommand: BrowserCommandHandler) {}

  start(port: number): void {
    this.wss = new WebSocketServer({ host: HOST, port });
    this.wss.on('connection', (socket) => {
      socket.on(
        'message',
        (data) => void this.handleSocketMessage(socket, rawSocketDataToString(data)),
      );
    });
  }

  stop(): void {
    this.wss?.close();
    this.wss = null;
  }

  private async handleSocketMessage(socket: WebSocket, raw: string): Promise<void> {
    const message = JSON.parse(raw) as ElectronBrowserCommandMessage;
    if (message.type !== 'browser:command') return;
    try {
      const result = await this.handleCommand(message.sessionId, message.command);
      socket.send(JSON.stringify({ id: message.id, type: 'browser:result', ok: true, result }));
    } catch (error) {
      socket.send(
        JSON.stringify({
          id: message.id,
          type: 'browser:result',
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }
}
