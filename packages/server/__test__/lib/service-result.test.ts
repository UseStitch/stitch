import { describe, expect, it } from 'vitest';

import { err, isServiceError, ok, type ServiceResult } from '@/lib/service-result.js';

describe('ServiceResult', () => {
  it('ok() should create a success result', () => {
    const result = ok({ foo: 'bar' });
    expect(result).toEqual({ data: { foo: 'bar' } });
    expect(isServiceError(result)).toBe(false);
  });

  it('err() should create an error result with status', () => {
    const result = err('Not found', 404, { id: '123' });
    expect(result).toEqual({ error: 'Not found', status: 404, details: { id: '123' } });
    expect(isServiceError(result)).toBe(true);
  });

  it('err() should support all configured HTTP status codes', () => {
    const statuses = [400, 401, 403, 404, 409, 422, 500] as const;

    for (const status of statuses) {
      const result = err('Error', status);
      expect(result.status).toBe(status);
    }
  });

  it('isServiceError() should act as a type guard', () => {
    const successResult: ServiceResult<string> = ok('success');
    const errorResult: ServiceResult<string> = err('failed', 400);

    if (isServiceError(successResult)) {
      expect.fail('Should not be an error');
    } else {
      expect(successResult.data).toBe('success');
    }

    if (isServiceError(errorResult)) {
      expect(errorResult.error).toBe('failed');
      expect(errorResult.status).toBe(400);
    } else {
      expect.fail('Should be an error');
    }
  });
});
