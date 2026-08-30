import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';

import type { CursorPage } from '@stitch/shared/pagination';

export function encodeCursor<T>(value: T): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new HTTPException(400, { message: 'Invalid pagination cursor' });
  }
}

export function createCursorPage<T>(rows: T[], limit: number, getCursor: (item: T) => string): CursorPage<T> {
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: rows.length > limit ? getCursor(items[items.length - 1]) : null,
  };
}
