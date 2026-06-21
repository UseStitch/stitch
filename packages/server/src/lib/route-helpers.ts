import { err, ok } from './service-result.js';

import type { ServiceResult } from './service-result.js';
import type { Context } from 'hono';

type SuccessStatus = 200 | 201 | 202 | 204;

export function unwrapResult<T>(
  c: Context,
  result: ServiceResult<T>,
  successStatus: SuccessStatus = 200,
): Response {
  if (result.error) {
    const body: Record<string, unknown> = { error: result.error.message };
    if (result.error.details !== undefined) body.details = result.error.details;
    return c.json(body, result.error.status);
  }

  if (successStatus === 204) return c.body(null, 204);
  return c.json(result.data, successStatus);
}

export function requireFound<T>(value: T | null | undefined, label: string): ServiceResult<T> {
  if (value === null || value === undefined) return err(`${label} not found`, 404);
  return ok(value);
}
