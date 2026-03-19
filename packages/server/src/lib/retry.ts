import { mapAIError } from '@/lib/ai-error-mapper.js';

const RETRY_INITIAL_DELAY = 2000;
const RETRY_BACKOFF_FACTOR = 2;
const RETRY_MAX_DELAY_NO_HEADERS = 30000;
export const MAX_RETRIES = 5;

type ErrorInfo = ReturnType<typeof mapAIError>;

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortHandler = () => {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timeout = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', abortHandler);
      resolve();
    }, ms);
    if (signal) signal.addEventListener('abort', abortHandler, { once: true });
  });
}

export function delay(attempt: number, headers?: Record<string, string>): number {
  if (headers) {
    const retryAfterMs = headers['retry-after-ms'];
    if (retryAfterMs) {
      const parsedMs = Number.parseFloat(retryAfterMs);
      if (!Number.isNaN(parsedMs)) {
        return parsedMs;
      }
    }

    const retryAfter = headers['retry-after'];
    if (retryAfter) {
      const parsedSeconds = Number.parseFloat(retryAfter);
      if (!Number.isNaN(parsedSeconds)) {
        return Math.ceil(parsedSeconds * 1000);
      }
      const parsed = Date.parse(retryAfter) - Date.now();
      if (!Number.isNaN(parsed) && parsed > 0) {
        return Math.ceil(parsed);
      }
    }

    return RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1);
  }

  return Math.min(
    RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1),
    RETRY_MAX_DELAY_NO_HEADERS,
  );
}

export function extractErrorInfo(error: unknown, providerId?: string): ErrorInfo {
  return mapAIError(error, providerId);
}

export function isRetryable(errorInfo: ErrorInfo): string | undefined {
  if (errorInfo.isContextOverflow) {
    return undefined;
  }

  if (!errorInfo.isRetryable) {
    return undefined;
  }

  if (errorInfo.category === 'rate_limited') {
    return 'Rate limited';
  }

  if (errorInfo.category === 'api_error' && errorInfo.statusCode && errorInfo.statusCode >= 500) {
    return 'Provider server error';
  }

  const msg = errorInfo.message.toLowerCase();

  if (msg.includes('overloaded')) {
    return 'Provider is overloaded';
  }

  if (
    msg.includes('rate limit') ||
    msg.includes('too many requests') ||
    msg.includes('rate_limit')
  ) {
    return 'Rate limited';
  }

  if (errorInfo.statusCode) {
    if (errorInfo.statusCode === 429 || errorInfo.statusCode === 503) {
      return errorInfo.message;
    }
    if (errorInfo.statusCode >= 500 && errorInfo.statusCode < 600) {
      return 'Provider server error';
    }
  }

  return errorInfo.message;
}
