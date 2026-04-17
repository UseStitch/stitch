import { describe, expect, it, vi } from 'vitest';

import { respondWith } from '@/lib/route-responses.js';
import { err, ok } from '@/lib/service-result.js';
import type { Context } from 'hono';

describe('route-responses', () => {
  const mockContext = () => {
    const c = {
      json: vi.fn().mockImplementation((data, status) => ({ type: 'json', data, status })),
      body: vi.fn().mockImplementation((data, status) => ({ type: 'body', data, status })),
    } as unknown as Context;
    return c;
  };

  it('should respond with JSON for ok() result using default 200 status', () => {
    const c = mockContext();
    const result = ok({ hello: 'world' });

    const response = respondWith(c, result);

    expect(c.json).toHaveBeenCalledWith({ hello: 'world' }, 200);
    expect(response).toEqual({ type: 'json', data: { hello: 'world' }, status: 200 });
  });

  it('should respond with JSON for ok() result using custom status 201', () => {
    const c = mockContext();
    const result = ok({ created: true });

    const response = respondWith(c, result, 201);

    expect(c.json).toHaveBeenCalledWith({ created: true }, 201);
    expect(response).toEqual({ type: 'json', data: { created: true }, status: 201 });
  });

  it('should respond with empty body for ok() result using custom status 204', () => {
    const c = mockContext();
    const result = ok(null);

    const response = respondWith(c, result, 204);

    expect(c.body).toHaveBeenCalledWith(null, 204);
    expect(response).toEqual({ type: 'body', data: null, status: 204 });
  });

  it('should respond with JSON error for err() result', () => {
    const c = mockContext();
    const result = err('Invalid input', 422, { field: 'name' });

    const response = respondWith(c, result);

    expect(c.json).toHaveBeenCalledWith(
      { error: 'Invalid input', details: { field: 'name' } },
      422,
    );
    expect(response).toEqual({
      type: 'json',
      data: { error: 'Invalid input', details: { field: 'name' } },
      status: 422,
    });
  });

  it('should override successStatus if the result is an error', () => {
    const c = mockContext();
    const result = err('Conflict', 409);

    const response = respondWith(c, result, 201);

    expect(c.json).toHaveBeenCalledWith({ error: 'Conflict', details: undefined }, 409);
    expect(response).toEqual({
      type: 'json',
      data: { error: 'Conflict', details: undefined },
      status: 409,
    });
  });
});
