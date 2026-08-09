import { GoogleClient } from './client.js';

type StubHandlers = {
  request?: (url: string, options?: RequestInit) => Promise<unknown>;
  requestRaw?: (url: string, options?: RequestInit) => Promise<Response>;
};

/** GoogleClient whose HTTP methods are served by in-test handlers instead of fetch. */
export class StubGoogleClient extends GoogleClient {
  private readonly handlers: StubHandlers;

  constructor(handlers: StubHandlers) {
    super({ getAccessToken: async () => 'test-token' });
    this.handlers = handlers;
  }

  override async request<T>(url: string, options?: RequestInit): Promise<T> {
    const handler = this.handlers.request;
    if (!handler) {
      throw new Error(`Unexpected request: ${url}`);
    }

    return (await handler(url, options)) as T;
  }

  override async requestRaw(url: string, options?: RequestInit): Promise<Response> {
    const handler = this.handlers.requestRaw;
    if (!handler) {
      throw new Error(`Unexpected raw request: ${url}`);
    }

    return handler(url, options);
  }
}
