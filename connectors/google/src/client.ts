/**
 * Lightweight HTTP client for authenticated Google API requests.
 * Does NOT manage OAuth or token refresh — it receives a token getter
 * callback that the server's connector system provides.
 */

import { noopLogger, type GoogleLogger } from './logger.js';
import {
  DEFAULT_GOOGLE_RATE_LIMIT_CONFIG,
  GoogleRateLimitCoordinator,
  type GoogleRateLimitConfig,
} from './rate-limit.js';

export type GoogleClientConfig = {
  /** Callback that returns a fresh access token (post-refresh if needed). */
  getAccessToken: () => Promise<string>;
  /** Optional logger instance — defaults to no-op if not provided. */
  logger?: GoogleLogger;
  /** Stable per-account key for account-level quota limiting. */
  quotaAccountKey?: string | null;
  /** Optional overrides for the built-in Google API limiter config. */
  rateLimits?: Partial<GoogleRateLimitConfig>;
};

export class GoogleApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly reason: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; reason?: string; retryAfterMs?: number },
  ) {
    super(message);
    this.name = 'GoogleApiError';
    this.status = status;
    this.code = options?.code;
    this.reason = options?.reason;
    this.retryAfterMs = options?.retryAfterMs;
  }
}

type GoogleErrorResponse = {
  error?: {
    message?: string;
    code?: number;
    status?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};

type RequestOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
};

export class GoogleClient {
  private static readonly MAX_RETRIES = 5;
  private static readonly MAX_BACKOFF_MS = 64_000;

  private readonly getAccessToken: () => Promise<string>;
  private readonly rateLimitCoordinator: GoogleRateLimitCoordinator;
  readonly log: GoogleLogger;

  constructor(config: GoogleClientConfig) {
    this.getAccessToken = config.getAccessToken;
    this.log = config.logger ?? noopLogger;
    this.rateLimitCoordinator = new GoogleRateLimitCoordinator(
      mergeRateLimitConfig(config.rateLimits),
      config.quotaAccountKey,
    );
  }

  async request<T>(url: string, options?: RequestOptions): Promise<T> {
    const response = await this.executeWithRetries(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    return (await response.json()) as T;
  }

  async requestText(url: string, options?: RequestOptions): Promise<string> {
    const response = await this.executeWithRetries(url, options);
    return await response.text();
  }

  private async executeWithRetries(url: string, options?: RequestOptions): Promise<Response> {
    const method = options?.method ?? 'GET';

    for (let attempt = 1; attempt <= GoogleClient.MAX_RETRIES + 1; attempt += 1) {
      try {
        const queuedMs = await this.rateLimitCoordinator.acquire(url, method, options?.signal);
        if (queuedMs > 0) {
          this.log.debug(
            { url, method, queuedMs },
            'Delayed Google API request due to local quota queue',
          );
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Local Google quota queue wait exceeded';
        throw new GoogleApiError(429, message, { reason: 'localRateLimitExceeded' });
      }

      const token = await this.getAccessToken();

      this.log.debug({ url, method, attempt }, 'Google API request');

      const response = await fetch(url, {
        method,
        body: options?.body,
        signal: options?.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          ...options?.headers,
        },
      });

      if (response.ok) {
        return response;
      }

      const parsedError = await parseGoogleApiError(response);
      const apiError = new GoogleApiError(response.status, parsedError.message, {
        code: parsedError.code,
        reason: parsedError.reason,
        retryAfterMs: parsedError.retryAfterMs,
      });

      const retryable =
        attempt <= GoogleClient.MAX_RETRIES &&
        isRetryableRateLimit(response.status, parsedError.reason, parsedError.message);

      if (!retryable) {
        this.log.error(
          {
            url,
            method,
            status: response.status,
            code: parsedError.code,
            reason: parsedError.reason,
          },
          parsedError.message,
        );
        throw apiError;
      }

      const backoffMs =
        parsedError.retryAfterMs ??
        computeExponentialBackoffMs(attempt, GoogleClient.MAX_BACKOFF_MS);

      this.log.warn(
        {
          url,
          method,
          status: response.status,
          code: parsedError.code,
          reason: parsedError.reason,
          attempt,
          backoffMs,
        },
        'Google API rate limited, retrying request',
      );

      await sleep(backoffMs, options?.signal);
    }

    throw new GoogleApiError(503, 'Google API request failed after retries', {
      reason: 'maxRetriesExceeded',
    });
  }
}

type ParsedApiError = {
  message: string;
  code: string | undefined;
  reason: string | undefined;
  retryAfterMs: number | undefined;
};

function mergeRateLimitConfig(overrides: Partial<GoogleRateLimitConfig> | undefined): GoogleRateLimitConfig {
  if (!overrides) {
    return DEFAULT_GOOGLE_RATE_LIMIT_CONFIG;
  }

  return {
    maxQueueWaitMs: overrides.maxQueueWaitMs ?? DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.maxQueueWaitMs,
    services: {
      gmail: {
        project:
          overrides.services?.gmail?.project ?? DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.gmail.project,
        account:
          overrides.services?.gmail?.account ?? DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.gmail.account,
      },
      drive: {
        project:
          overrides.services?.drive?.project ?? DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.drive.project,
        account:
          overrides.services?.drive?.account ?? DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.drive.account,
      },
      docsRead: {
        project:
          overrides.services?.docsRead?.project ??
          DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.docsRead.project,
        account:
          overrides.services?.docsRead?.account ??
          DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.docsRead.account,
      },
      docsWrite: {
        project:
          overrides.services?.docsWrite?.project ??
          DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.docsWrite.project,
        account:
          overrides.services?.docsWrite?.account ??
          DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.docsWrite.account,
      },
      calendar: {
        project:
          overrides.services?.calendar?.project ??
          DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.calendar.project,
        account:
          overrides.services?.calendar?.account ??
          DEFAULT_GOOGLE_RATE_LIMIT_CONFIG.services.calendar.account,
      },
    },
  };
}

async function parseGoogleApiError(response: Response): Promise<ParsedApiError> {
  const fallbackMessage = `Google API error: ${response.status} ${response.statusText}`;
  const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));

  let bodyText = '';
  try {
    bodyText = await response.text();
  } catch {
    return {
      message: fallbackMessage,
      code: undefined,
      reason: undefined,
      retryAfterMs,
    };
  }

  if (!bodyText) {
    return {
      message: fallbackMessage,
      code: undefined,
      reason: undefined,
      retryAfterMs,
    };
  }

  try {
    const parsed = JSON.parse(bodyText) as GoogleErrorResponse;
    const message = parsed.error?.message ?? fallbackMessage;
    const code = parsed.error?.status;
    const reason = parsed.error?.errors?.[0]?.reason;
    return {
      message,
      code,
      reason,
      retryAfterMs,
    };
  } catch {
    return {
      message: fallbackMessage,
      code: undefined,
      reason: undefined,
      retryAfterMs,
    };
  }
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const asSeconds = Number.parseFloat(value);
  if (!Number.isNaN(asSeconds)) {
    return Math.max(0, Math.ceil(asSeconds * 1000));
  }

  const asDateDelta = Date.parse(value) - Date.now();
  if (!Number.isNaN(asDateDelta) && asDateDelta > 0) {
    return Math.ceil(asDateDelta);
  }

  return undefined;
}

function computeExponentialBackoffMs(attempt: number, maxDelayMs: number): number {
  const baseMs = Math.min(Math.pow(2, attempt - 1) * 1000, maxDelayMs);
  return Math.min(maxDelayMs, baseMs + Math.floor(Math.random() * 1000));
}

function isRetryableRateLimit(status: number, reason: string | undefined, message: string): boolean {
  if (status === 429 || status === 503) {
    return true;
  }

  if (status !== 403) {
    return false;
  }

  if (reason) {
    const normalized = reason.toLowerCase();
    if (
      normalized === 'ratelimitexceeded' ||
      normalized === 'userratelimitexceeded' ||
      normalized === 'quotaexceeded'
    ) {
      return true;
    }
  }

  return /rate.?limit|too many requests|quota/i.test(message);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ms <= 0) {
      resolve();
      return;
    }

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const timeout = setTimeout(() => {
      if (signal) {
        signal.removeEventListener('abort', onAbort);
      }
      resolve();
    }, ms);

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
}
