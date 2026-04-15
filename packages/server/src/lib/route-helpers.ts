import type { Context } from 'hono';
import { isServiceError } from './service-result.js';
import type { ServiceResult } from './service-result.js';

type SuccessStatus = 200 | 201 | 202 | 204;

export function unwrapResult<T>(
  c: Context,
  result: ServiceResult<T>,
  successStatus: SuccessStatus = 200,
): Response {
  if (isServiceError(result)) {
    const body: Record<string, unknown> = { error: result.error };
    if (result.details !== undefined) body.details = result.details;
    return c.json(body, result.status);
  }

  if (successStatus === 204) return c.body(null, 204);
  return c.json(result.data, successStatus);
}

export function requireFound<T>(
  value: T | null | undefined,
  label: string,
): ServiceResult<T> {
  if (value === null || value === undefined) return { error: `${label} not found`, status: 404 };
  return { data: value };
}