import { APICallError } from 'ai';

const RETRY_INITIAL_DELAY = 2000;
const RETRY_BACKOFF_FACTOR = 2;
const RETRY_MAX_DELAY_NO_HEADERS = 30000;
export const MAX_RETRIES = 5;

const OVERFLOW_PATTERNS = [
  /prompt is too long/i,
  /input is too long for requested model/i,
  /exceeds the context window/i,
  /input token count.*exceeds the maximum/i,
  /maximum prompt length is \d+/i,
  /reduce the length of the messages/i,
  /maximum context length is \d+ tokens/i,
  /exceeds the limit of \d+/i,
  /exceeds the available context size/i,
  /context window exceeds limit/i,
  /exceeded model token limit/i,
  /context[_\s]length[_\s]exceeded/i,
];

interface ErrorInfo {
  message: string;
  statusCode?: number;
  isRetryable: boolean;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  isContextOverflow: boolean;
}

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

function isOverflow(message: string, statusCode?: number): boolean {
  if (statusCode === 413) return true;
  return OVERFLOW_PATTERNS.some((p) => p.test(message));
}

function isOpenAiErrorRetryable(error: APICallError): boolean {
  const status = error.statusCode;
  if (!status) return error.isRetryable;
  return status === 404 || error.isRetryable;
}

export function extractErrorInfo(error: unknown, providerId?: string): ErrorInfo {
  if (error instanceof APICallError) {
    let responseHeaders: Record<string, string> | undefined;
    if (error.responseHeaders) {
      const headers = error.responseHeaders as unknown as Iterable<[string, string]>;
      responseHeaders = {};
      for (const [key, value] of headers) {
        responseHeaders[key.toLowerCase()] = value;
      }
    }

    let message = error.message;
    if (!message && error.responseBody) {
      try {
        const body = JSON.parse(error.responseBody);
        message = body.message || body.error?.message || error.responseBody;
      } catch {
        message = error.responseBody;
      }
    }
    if (!message && error.statusCode) {
      message = `HTTP ${error.statusCode}`;
    }
    if (!message) {
      message = 'Unknown error';
    }

    const isContextOverflow = isOverflow(message, error.statusCode);

    const isRetryable =
      providerId?.startsWith('openai')
        ? isOpenAiErrorRetryable(error)
        : error.isRetryable;

    return {
      message,
      statusCode: error.statusCode,
      isRetryable: isRetryable && !isContextOverflow,
      responseHeaders,
      responseBody: error.responseBody,
      isContextOverflow,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    message,
    isRetryable: false,
    isContextOverflow: isOverflow(message),
  };
}

export function isRetryable(errorInfo: ErrorInfo): string | undefined {
  if (errorInfo.isContextOverflow) {
    return undefined;
  }

  if (!errorInfo.isRetryable) {
    return undefined;
  }

  const msg = errorInfo.message.toLowerCase();

  if (msg.includes('overloaded')) {
    return 'Provider is overloaded';
  }

  if (msg.includes('rate limit') || msg.includes('too many requests') || msg.includes('rate_limit')) {
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
