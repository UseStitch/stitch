export type MemorySource = 'chat' | 'automation';

const MEMORY_TARGETS = ['memory', 'user'] as const;
export type MemoryTarget = (typeof MEMORY_TARGETS)[number];

const MEMORY_ORIGINS = ['user', 'agent', 'automation', 'system'] as const;
export type MemoryOrigin = (typeof MEMORY_ORIGINS)[number];

export type ManagedMemoryEntry = {
  id: string;
  content: string;
  origin: MemoryOrigin;
  observed: string;
  source: string;
  target: MemoryTarget;
  filePath: string;
  lineStart: number;
  lineEnd: number;
};

export type MemoryCapacity = { used: number; limit: number; remaining: number };

export type MemoryFileName = 'MEMORY.md' | 'USER.md' | 'DREAMS.md';

export type MemoryFileSnapshot = {
  name: MemoryFileName | `daily/${string}.md`;
  path: string;
  rawContent: string;
  modelContent: string;
  contentHash: string;
  mtime: string;
  entries: ManagedMemoryEntry[];
  capacity: MemoryCapacity | null;
  truncated: boolean;
};

export type MemoryMutation =
  | { type: 'add'; content: string; origin?: MemoryOrigin; source?: string }
  | { type: 'replace'; oldText: string; content: string }
  | { type: 'remove'; oldText: string };

export type MemorySearchResult = {
  filePath: string;
  entryId: string | null;
  observed: string | null;
  excerpt: string;
  lineStart: number;
  lineEnd: number;
};

export type MemoryConsolidationStatus = {
  status: 'never' | 'accepted' | 'rejected' | 'failed' | 'noop';
  lastRunAt: string | null;
  summary: string | null;
  candidateCount: number;
  promotedCount: number;
  rejectedCount: number;
};

export type MemoryConsolidationResult = Omit<MemoryConsolidationStatus, 'status' | 'lastRunAt' | 'summary'> & {
  status: Exclude<MemoryConsolidationStatus['status'], 'never'>;
  lastRunAt: string;
  summary: string;
};

export type MemoryFilesOverview = {
  memory: MemoryFileSnapshot;
  user: MemoryFileSnapshot;
  dreams: MemoryFileSnapshot;
  pendingCandidateCount: number;
  processedCandidateIds: string[];
  consolidation: MemoryConsolidationStatus;
};

export type DailyMemoryFilesResponse = {
  files: MemoryFileSnapshot[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
