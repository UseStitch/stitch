import { sleep } from './utils.js';

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
      project: { capacity: 1_000_000, windowMs: 60_000 },
      account: { capacity: 325_000, windowMs: 60_000 },
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
  MESSAGES_ATTACHMENTS_GET: 20,
  MESSAGES_MODIFY: 5,
  MESSAGES_SEND: 100,
  LABELS_LIST: 1,
  LABELS_GET: 1,
  LABELS_MUTATE: 5,
  THREADS_MODIFY: 10,
  FILTERS_LIST: 1,
  FILTERS_GET: 1,
  FILTERS_MUTATE: 5,
  DEFAULT: 5,
} as const;

const DRIVE_METHOD_COSTS = {
  FILES_GET: 5,
  FILES_LIST: 100,
  FILES_DOWNLOAD: 200,
  FILES_UPDATE: 50,
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

  if (/\/messages\/[^/]+\/attachments\/[^/]+$/.test(withoutQuery) && method === 'GET') {
    return GMAIL_METHOD_COSTS.MESSAGES_ATTACHMENTS_GET;
  }

  if (withoutQuery.endsWith('/labels')) {
    return method === 'GET' ? GMAIL_METHOD_COSTS.LABELS_LIST : GMAIL_METHOD_COSTS.LABELS_MUTATE;
  }

  if (/\/labels\/[^/]+$/.test(withoutQuery)) {
    return method === 'GET' ? GMAIL_METHOD_COSTS.LABELS_GET : GMAIL_METHOD_COSTS.LABELS_MUTATE;
  }

  if (withoutQuery.endsWith('/settings/filters')) {
    return method === 'GET' ? GMAIL_METHOD_COSTS.FILTERS_LIST : GMAIL_METHOD_COSTS.FILTERS_MUTATE;
  }

  if (/\/settings\/filters\/[^/]+$/.test(withoutQuery)) {
    return method === 'GET' ? GMAIL_METHOD_COSTS.FILTERS_GET : GMAIL_METHOD_COSTS.FILTERS_MUTATE;
  }

  return GMAIL_METHOD_COSTS.DEFAULT;
}

function resolveDriveQuotaCost(
  pathname: string,
  method: string,
  searchParams: URLSearchParams,
): number {
  if (pathname.endsWith('/files') && method === 'GET') {
    return DRIVE_METHOD_COSTS.FILES_LIST;
  }

  if (/\/files\/[^/]+\/download$/.test(pathname) && method === 'GET') {
    return DRIVE_METHOD_COSTS.FILES_DOWNLOAD;
  }

  if (/\/files\/[^/]+\/export$/.test(pathname) && method === 'GET') {
    return DRIVE_METHOD_COSTS.FILES_DOWNLOAD;
  }

  if (/\/files\/[^/]+$/.test(pathname) && method === 'GET') {
    return searchParams.get('alt') === 'media'
      ? DRIVE_METHOD_COSTS.FILES_DOWNLOAD
      : DRIVE_METHOD_COSTS.FILES_GET;
  }

  if (/\/files\/[^/]+$/.test(pathname) && (method === 'PATCH' || method === 'PUT')) {
    return DRIVE_METHOD_COSTS.FILES_UPDATE;
  }

  return DRIVE_METHOD_COSTS.DEFAULT;
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
    if (parsed.pathname.startsWith('/drive/') || parsed.pathname.startsWith('/upload/drive/')) {
      return {
        service: 'drive',
        quotaCost: resolveDriveQuotaCost(parsed.pathname, normalizedMethod, parsed.searchParams),
      };
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

class SlidingWindowLimiter {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly events: { timestamp: number; weight: number }[] = [];
  private pending: Promise<void> = Promise.resolve();
  private usedWeight: number = 0;

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
    const expiredCount = this.events.findIndex((event) => now - event.timestamp < this.windowMs);

    if (expiredCount === -1 && this.events.length > 0) {
      // All events are expired
      this.usedWeight = 0;
      this.events.length = 0;
    } else if (expiredCount > 0) {
      // Some events are expired
      const expired = this.events.splice(0, expiredCount);
      for (const event of expired) {
        this.usedWeight -= event.weight;
      }
    }
  }

  private used(): number {
    return this.usedWeight;
  }

  private async acquireInternal(weight: number, options: AcquireOptions): Promise<number> {
    let waitedMs = 0;

    while (true) {
      const now = Date.now();
      this.pruneExpired(now);

      if (this.used() + weight <= this.capacity) {
        this.events.push({ timestamp: now, weight });
        this.usedWeight += weight;
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

    const [projectWait, accountWait] = await Promise.all([
      projectLimiter.acquire(operation.quotaCost, {
        maxWaitMs: this.config.maxQueueWaitMs,
        signal,
      }),
      accountLimiter.acquire(operation.quotaCost, {
        maxWaitMs: this.config.maxQueueWaitMs,
        signal,
      }),
    ]);

    return projectWait + accountWait;
  }
}

export function resetGoogleRateLimitCoordinatorForTests(): void {
  projectLimiters.clear();
  accountLimiters.clear();
}
