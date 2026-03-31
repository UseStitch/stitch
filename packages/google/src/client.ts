/**
 * Lightweight HTTP client for authenticated Google API requests.
 * Does NOT manage OAuth or token refresh — it receives a token getter
 * callback that the server's connector system provides.
 */

export type GoogleClientConfig = {
  /** Callback that returns a fresh access token (post-refresh if needed). */
  getAccessToken: () => Promise<string>;
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

  constructor(config: GoogleClientConfig) {
    this.getAccessToken = config.getAccessToken;
  }

  async request<T>(url: string, options?: RequestOptions): Promise<T> {
    const token = await this.getAccessToken();

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

      throw new GoogleApiError(response.status, errorMessage, errorCode);
    }

    return (await response.json()) as T;
  }

  async requestText(url: string, options?: RequestOptions): Promise<string> {
    const token = await this.getAccessToken();

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
      throw new GoogleApiError(
        response.status,
        `Google API error: ${response.status} ${response.statusText}`,
      );
    }

    return response.text();
  }
}
