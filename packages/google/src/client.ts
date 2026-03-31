/**
 * Lightweight HTTP client for authenticated Google API requests.
 * Does NOT manage OAuth or token refresh — it receives a token getter
 * callback that the server's connector system provides.
 */

import { noopLogger, type GoogleLogger } from './logger.js';

export type GoogleClientConfig = {
  /** Callback that returns a fresh access token (post-refresh if needed). */
  getAccessToken: () => Promise<string>;
  /** Optional logger instance — defaults to no-op if not provided. */
  logger?: GoogleLogger;
};

export class GoogleApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
    this.code = code;
  }
}

type GoogleErrorResponse = {
  error?: {
    message?: string;
    code?: number;
    status?: string;
  };
};

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

export class GoogleClient {
  private readonly getAccessToken: () => Promise<string>;
  readonly log: GoogleLogger;

  constructor(config: GoogleClientConfig) {
    this.getAccessToken = config.getAccessToken;
    this.log = config.logger ?? noopLogger;
  }

  async request<T>(url: string, options?: RequestOptions): Promise<T> {
    const token = await this.getAccessToken();

    this.log.debug({ url, method: options?.method ?? 'GET' }, 'Google API request');

    const response = await fetch(url, {
      method: options?.method,
      body: options?.body,
      signal: options?.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = `Google API error: ${response.status} ${response.statusText}`;
      let errorCode: string | undefined;

      try {
        const body = (await response.json()) as GoogleErrorResponse;
        if (body.error?.message) {
          errorMessage = body.error.message;
          errorCode = body.error.status;
        }
      } catch {
        // Use default error message
      }

      this.log.error({ url, status: response.status, errorCode }, errorMessage);
      throw new GoogleApiError(response.status, errorMessage, errorCode);
    }

    return (await response.json()) as T;
  }

  async requestText(url: string, options?: RequestOptions): Promise<string> {
    const token = await this.getAccessToken();

    this.log.debug({ url, method: options?.method ?? 'GET' }, 'Google API text request');

    const response = await fetch(url, {
      method: options?.method,
      body: options?.body,
      signal: options?.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorMessage = `Google API error: ${response.status} ${response.statusText}`;
      this.log.error({ url, status: response.status }, errorMessage);
      throw new GoogleApiError(response.status, errorMessage);
    }

    return response.text();
  }
}
