import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { type ServiceResult, isServiceError } from '@/lib/service-result.js';

export function respondWith<T>(
  c: Context,
  result: ServiceResult<T>,
  successStatus: 200 | 201 | 204 = 200
): Response | Promise<Response> {
  if (isServiceError(result)) {
    return c.json(
      { error: result.error, details: result.details },
      result.status as ContentfulStatusCode
    );
  }

  if (successStatus === 204) {
    return c.body(null, 204);
  }

  return c.json(result.data, successStatus as ContentfulStatusCode);
}
