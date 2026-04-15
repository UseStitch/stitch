import { describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import { err, ok } from '@/lib/service-result.js';
import { requireFound, unwrapResult } from '@/lib/route-helpers.js';

describe('route-helpers', () => {
  const mockContext = () => {
    const c = vi.fn() as unknown as Context;
    c.json = vi.fn().mockImplementation((_data: unknown, _status: number) => c);
    c.body = vi.fn().mockImplementation((_data: unknown, _status: number) => c);
    return c;
  };

  describe('unwrapResult', () => {
    it('should return success with 200 status', () => {
      const c = mockContext();
      const result = ok({ hello: 'world' });

      unwrapResult(c, result);

      expect(c.json).toHaveBeenCalledWith({ hello: 'world' }, 200);
    });

    it('should return success with 201 status', () => {
      const c = mockContext();
      const result = ok({ created: true });

      unwrapResult(c, result, 201);

      expect(c.json).toHaveBeenCalledWith({ created: true }, 201);
    });

    it('should return success with 202 status', () => {
      const c = mockContext();
      const result = ok({ processed: true });

      unwrapResult(c, result, 202);

      expect(c.json).toHaveBeenCalledWith({ processed: true }, 202);
    });

    it('should return empty body for 204 status', () => {
      const c = mockContext();
      const result = ok(null);

      unwrapResult(c, result, 204);

      expect(c.body).toHaveBeenCalledWith(null, 204);
    });

    it('should return error without details', () => {
      const c = mockContext();
      const result = err('Invalid input', 422);

      unwrapResult(c, result);

      expect(c.json).toHaveBeenCalledWith({ error: 'Invalid input' }, 422);
    });

    it('should return error with details', () => {
      const c = mockContext();
      const result = err('Invalid input', 422, { field: 'name' });

      unwrapResult(c, result);

      expect(c.json).toHaveBeenCalledWith({ error: 'Invalid input', details: { field: 'name' } }, 422);
    });
  });

  describe('requireFound', () => {
    it('should return success when value is defined', () => {
      const result = requireFound({ id: '123' }, 'Session');

      expect(result).toEqual({ data: { id: '123' } });
    });

    it('should return error when value is null', () => {
      const result = requireFound(null, 'Session');

      expect(result).toEqual({ error: 'Session not found', status: 404 });
    });

    it('should return error when value is undefined', () => {
      const result = requireFound(undefined, 'Session');

      expect(result).toEqual({ error: 'Session not found', status: 404 });
    });
  });
});