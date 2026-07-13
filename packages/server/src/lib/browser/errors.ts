import { ToolError } from '@/tools/errors.js';

export class BrowserBridgeNotConnectedError extends ToolError {
  constructor() {
    super('Desktop browser bridge is not connected. Browser tools require the Stitch desktop app.');
    this.name = 'BrowserBridgeNotConnectedError';
  }
}

export class BrowserBridgeNotConfiguredError extends ToolError {
  constructor() {
    super('Browser tools require the Stitch desktop app. No desktop browser bridge is configured.');
    this.name = 'BrowserBridgeNotConfiguredError';
  }
}

export class BrowserSessionNotSetError extends ToolError {
  constructor() {
    super('Browser sessionId must be set before executing commands.');
    this.name = 'BrowserSessionNotSetError';
  }
}
