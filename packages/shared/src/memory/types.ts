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

export type MemorySearchResult = SemanticMemory & { score: number };

export type ListSemanticMemoriesResponse = {
  memories: SemanticMemory[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type SearchSemanticMemoriesResponse = {
  memories: MemorySearchResult[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
