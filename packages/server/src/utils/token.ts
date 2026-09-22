import { z } from 'zod';

const StringSchema = z.string();

/**
 * Rough token estimation without a full tokenizer.
 * ~4 characters per token is a widely-used heuristic for English text.
 */
export function estimate(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = StringSchema.safeParse(value);
  const text = parsed.success ? parsed.data : JSON.stringify(value);
  return Math.ceil(text.length / 4);
}
