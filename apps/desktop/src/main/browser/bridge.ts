import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';

import type { ElectronBrowserCommand, ElectronBrowserCommandResultValue } from '@stitch/shared/browser/electron';

import { rawSocketDataToString } from './url.js';

const HOST = '127.0.0.1';

type BrowserCommandHandler = (
  sessionId: string,
  command: ElectronBrowserCommand,
) => Promise<ElectronBrowserCommandResultValue>;
const browserCommandSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['ensure', 'state', 'executionState', 'snapshot', 'goBack', 'goForward', 'listTabs', 'dialogState']),
  }),
  z.object({ action: z.literal('navigate'), url: z.string(), timeoutMs: z.number().optional() }),
  z.object({
    action: z.literal('search'),
    query: z.string(),
    engine: z.string().optional(),
    timeoutMs: z.number().optional(),
  }),
  z.object({ action: z.literal('newTab'), url: z.string().optional(), timeoutMs: z.number().optional() }),
  z.object({ action: z.literal('focusTab'), tabId: z.string(), timeoutMs: z.number().optional() }),
  z.object({ action: z.literal('closeTab'), tabId: z.string().optional() }),
  z.object({
    action: z.literal('click'),
    ref: z.string(),
    doubleClick: z.boolean().optional(),
    button: z.string().optional(),
    modifiers: z.array(z.string()).optional(),
    timeoutMs: z.number().optional(),
  }),
  z.object({ action: z.literal('hover'), ref: z.string() }),
  z.object({
    action: z.literal('type'),
    ref: z.string(),
    text: z.string(),
    slowly: z.boolean().optional(),
    submit: z.boolean().optional(),
    clear: z.boolean().optional(),
  }),
  z.object({ action: z.literal('press'), key: z.string(), timeoutMs: z.number().optional() }),
  z.object({ action: z.literal('select'), ref: z.string(), values: z.array(z.string()) }),
  z.object({ action: z.literal('getDropdownOptions'), ref: z.string() }),
  z.object({
    action: z.literal('selectDropdown'),
    ref: z.string(),
    text: z.string(),
    timeoutMs: z.number().optional(),
  }),
  z.object({
    action: z.literal('scroll'),
    ref: z.string().optional(),
    direction: z.enum(['up', 'down', 'left', 'right']),
  }),
  z.object({
    action: z.literal('screenshot'),
    ref: z.string().optional(),
    format: z.enum(['png', 'jpeg']).optional(),
    quality: z.number().optional(),
    fullPage: z.boolean().optional(),
  }),
  z.object({ action: z.literal('evaluate'), expression: z.string() }),
  z.object({
    action: z.literal('wait'),
    timeMs: z.number().optional(),
    selector: z.string().optional(),
    timeoutMs: z.number().optional(),
  }),
  z.object({
    action: z.literal('extractPageContent'),
    query: z.string().optional(),
    selector: z.string().optional(),
    includeLinks: z.boolean().optional(),
    includeImages: z.boolean().optional(),
    outputSchema: z.record(z.string(), z.json()).optional(),
  }),
  z.object({
    action: z.literal('searchPage'),
    pattern: z.string(),
    regex: z.boolean().optional(),
    caseSensitive: z.boolean().optional(),
    contextChars: z.number().optional(),
    cssScope: z.string().optional(),
    maxResults: z.number().optional(),
  }),
  z.object({
    action: z.literal('findElements'),
    selector: z.string(),
    attributes: z.array(z.string()).optional(),
    includeText: z.boolean().optional(),
    maxResults: z.number().optional(),
  }),
  z.object({
    action: z.literal('handleDialog'),
    dialogAction: z.enum(['accept', 'dismiss']),
    promptText: z.string().optional(),
  }),
]);
const browserCommandMessageSchema = z.object({
  id: z.string(),
  type: z.literal('browser:command'),
  sessionId: z.string().regex(/^ses_/),
  command: browserCommandSchema,
});

export class BrowserBridge {
  private wss: WebSocketServer | null = null;

  constructor(private readonly handleCommand: BrowserCommandHandler) {}

  start(port: number): void {
    this.wss = new WebSocketServer({ host: HOST, port });
    this.wss.on('connection', (socket) => {
      socket.on('message', (data) => void this.handleSocketMessage(socket, rawSocketDataToString(data)));
    });
  }

  stop(): void {
    this.wss?.close();
    this.wss = null;
  }

  private async handleSocketMessage(socket: WebSocket, raw: string): Promise<void> {
    let id: string | null = null;
    try {
      const message = browserCommandMessageSchema.parse(JSON.parse(raw));
      id = message.id;
      const result = await this.handleCommand(message.sessionId, message.command);
      socket.send(JSON.stringify({ id: message.id, type: 'browser:result', ok: true, result }));
    } catch (error) {
      socket.send(
        JSON.stringify({
          id,
          type: 'browser:result',
          ok: false,
          error: Error.isError(error) ? error.message : String(error),
        }),
      );
    }
  }
}
