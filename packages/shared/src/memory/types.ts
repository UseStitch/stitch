export const MEMORY_CATEGORIES = ['preference', 'fact', 'constraint'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_CONFIDENCES = ['stated', 'inferred', 'confirmed'] as const;
export type MemoryConfidence = (typeof MEMORY_CONFIDENCES)[number];

export const MEMORY_SOURCES = ['chat', 'automation'] as const;
export type MemorySource = (typeof MEMORY_SOURCES)[number];

export type SemanticMemory = {
  id: string;
  content: string;
  category: MemoryCategory;
  confidence: MemoryConfidence;
  source: MemorySource;
  sourceId: string;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  lastAccessedAt: string;
  pinned: boolean;
};

export type ExtractedFact = { content: string; category: MemoryCategory; confidence: MemoryConfidence };

type SemanticMemorySearchResult = SemanticMemory & { score: number };

export type ListSemanticMemoriesResponse = {
  memories: SemanticMemory[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SearchSemanticMemoriesResponse = {
  memories: SemanticMemorySearchResult[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

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
