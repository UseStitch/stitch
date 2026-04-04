type RateLimitBucket = {
  capacity: number;
  windowMs: number;
};

type RateLimitServiceConfig = {
  project: RateLimitBucket;
  account: RateLimitBucket;
};

export type GoogleRateLimitConfig = {
  services: {
    gmail: RateLimitServiceConfig;
    drive: RateLimitServiceConfig;
    docsRead: RateLimitServiceConfig;
    docsWrite: RateLimitServiceConfig;
    calendar: RateLimitServiceConfig;
  };
  maxQueueWaitMs: number;
};

export const DEFAULT_GOOGLE_RATE_LIMIT_CONFIG: GoogleRateLimitConfig = {
  services: {
    gmail: {
      project: { capacity: 1_200_000, windowMs: 60_000 },
      account: { capacity: 15_000, windowMs: 60_000 },
    },
    drive: {
      project: { capacity: 12_000, windowMs: 60_000 },
      account: { capacity: 12_000, windowMs: 60_000 },
    },
    docsRead: {
      project: { capacity: 3000, windowMs: 60_000 },
      account: { capacity: 300, windowMs: 60_000 },
    },
    docsWrite: {
      project: { capacity: 600, windowMs: 60_000 },
      account: { capacity: 60, windowMs: 60_000 },
    },
    calendar: {
      project: { capacity: 6000, windowMs: 60_000 },
      account: { capacity: 600, windowMs: 60_000 },
    },
  },
  maxQueueWaitMs: 60_000,
};

type GoogleQuotaOperation = {
  service: keyof GoogleRateLimitConfig['services'];
  quotaCost: number;
};

const GMAIL_METHOD_COSTS = {
  MESSAGES_LIST: 5,
  MESSAGES_GET: 5,
  MESSAGES_MODIFY: 5,
  MESSAGES_SEND: 100,
  LABELS_LIST: 1,
  LABELS_GET: 1,
  LABELS_MUTATE: 5,
  THREADS_MODIFY: 10,
  DEFAULT: 5,
} as const;

function normalizeMethod(method: string | undefined): string {
  return (method ?? 'GET').toUpperCase();
}

function isWriteMethod(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
}

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function resolveGmailQuotaCost(pathname: string, method: string): number {
  const withoutQuery = pathname;

  if (withoutQuery.endsWith('/messages/send') && method === 'POST') {
    return GMAIL_METHOD_COSTS.MESSAGES_SEND;
  }

  if (/\/messages\/[^/]+\/modify$/.test(withoutQuery) && method === 'POST') {
    return GMAIL_METHOD_COSTS.MESSAGES_MODIFY;
  }

  if (/\/threads\/[^/]+\/modify$/.test(withoutQuery) && method === 'POST') {
    return GMAIL_METHOD_COSTS.THREADS_MODIFY;
  }

  if (withoutQuery.endsWith('/messages') && method === 'GET') {
    return GMAIL_METHOD_COSTS.MESSAGES_LIST;
  }

  if (/\/messages\/[^/]+$/.test(withoutQuery) && method === 'GET') {
    return GMAIL_METHOD_COSTS.MESSAGES_GET;
  }

  if (withoutQuery.endsWith('/labels')) {
    return method === 'GET' ? GMAIL_METHOD_COSTS.LABELS_LIST : GMAIL_METHOD_COSTS.LABELS_MUTATE;
  }

  if (/\/labels\/[^/]+$/.test(withoutQuery)) {
    return method === 'GET' ? GMAIL_METHOD_COSTS.LABELS_GET : GMAIL_METHOD_COSTS.LABELS_MUTATE;
  }

  return GMAIL_METHOD_COSTS.DEFAULT;
}

export function resolveGoogleQuotaOperation(
  url: string,
  method: string | undefined,
): GoogleQuotaOperation | null {
  const parsed = parseUrl(url);
  if (!parsed) {
    return null;
  }

  const normalizedMethod = normalizeMethod(method);

  if (parsed.hostname === 'gmail.googleapis.com') {
    return {
      service: 'gmail',
      quotaCost: resolveGmailQuotaCost(parsed.pathname, normalizedMethod),
    };
  }

  if (parsed.hostname === 'docs.googleapis.com') {
    return {
      service: isWriteMethod(normalizedMethod) ? 'docsWrite' : 'docsRead',
      quotaCost: 1,
    };
  }

  if (parsed.hostname === 'www.googleapis.com') {
    if (parsed.pathname.startsWith('/drive/')) {
      return { service: 'drive', quotaCost: 1 };
    }
    if (parsed.pathname.startsWith('/calendar/')) {
      return { service: 'calendar', quotaCost: 1 };
    }
  }

  return null;
}

type AcquireOptions = {
  signal?: AbortSignal;
  maxWaitMs: number;
};

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

class SlidingWindowLimiter {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly events: { timestamp: number; weight: number }[] = [];
  private pending: Promise<void> = Promise.resolve();

  constructor(config: RateLimitBucket) {
    this.capacity = config.capacity;
    this.windowMs = config.windowMs;
  }

  async acquire(weight: number, options: AcquireOptions): Promise<number> {
    if (weight > this.capacity) {
      throw new Error(
        `Requested quota cost (${weight}) exceeds limiter capacity (${this.capacity}) for ${this.windowMs}ms window`,
      );
    }

    const run = this.pending.then(async () => this.acquireInternal(weight, options));
    this.pending = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private pruneExpired(now: number): void {
    while (this.events.length > 0 && now - this.events[0].timestamp >= this.windowMs) {
      this.events.shift();
    }
  }

  private used(): number {
    return this.events.reduce((total, event) => total + event.weight, 0);
  }

  private async acquireInternal(weight: number, options: AcquireOptions): Promise<number> {
    let waitedMs = 0;

    while (true) {
      const now = Date.now();
      this.pruneExpired(now);

      if (this.used() + weight <= this.capacity) {
        this.events.push({ timestamp: now, weight });
        return waitedMs;
      }

      const oldest = this.events[0];
      if (!oldest) {
        this.events.push({ timestamp: now, weight });
        return waitedMs;
      }

      const waitForMs = Math.max(1, oldest.timestamp + this.windowMs - now);
      if (waitedMs + waitForMs > options.maxWaitMs) {
        throw new Error(`Rate limiter queue wait exceeded ${options.maxWaitMs}ms`);
      }

      await sleep(waitForMs, options.signal);
      waitedMs += waitForMs;
    }
  }
}

const projectLimiters = new Map<string, SlidingWindowLimiter>();
const accountLimiters = new Map<string, SlidingWindowLimiter>();

function getLimiter(
  cache: Map<string, SlidingWindowLimiter>,
  key: string,
  config: RateLimitBucket,
): SlidingWindowLimiter {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const created = new SlidingWindowLimiter(config);
  cache.set(key, created);
  return created;
}

export class GoogleRateLimitCoordinator {
  private readonly config: GoogleRateLimitConfig;
  private readonly accountKey: string;

  constructor(config: GoogleRateLimitConfig, accountKey?: string | null) {
    this.config = config;
    this.accountKey = accountKey?.trim() || 'default';
  }

  async acquire(url: string, method: string | undefined, signal?: AbortSignal): Promise<number> {
    const operation = resolveGoogleQuotaOperation(url, method);
    if (!operation) {
      return 0;
    }

    const serviceConfig = this.config.services[operation.service];
    const projectLimiter = getLimiter(
      projectLimiters,
      `${operation.service}:project`,
      serviceConfig.project,
    );
    const accountLimiter = getLimiter(
      accountLimiters,
      `${operation.service}:account:${this.accountKey}`,
      serviceConfig.account,
    );

    const projectWait = await projectLimiter.acquire(operation.quotaCost, {
      maxWaitMs: this.config.maxQueueWaitMs,
      signal,
    });
    const accountWait = await accountLimiter.acquire(operation.quotaCost, {
      maxWaitMs: this.config.maxQueueWaitMs,
      signal,
    });

    return projectWait + accountWait;
  }
}

export function resetGoogleRateLimitCoordinatorForTests(): void {
  projectLimiters.clear();
  accountLimiters.clear();
}
