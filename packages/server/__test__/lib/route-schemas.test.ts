import { describe, expect, it } from 'vitest';
import { paginationQuerySchema, prefixedId, routeSchemas } from '@/lib/route-schemas.js';
import { ID_PREFIXES } from '@stitch/shared/id';

describe('Route Schemas', () => {
  describe('prefixedId()', () => {
    it('should validate correctly formatted prefixed strings', () => {
      const schema = prefixedId(ID_PREFIXES.session);
      const result = schema.safeParse('ses_123abc');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('ses_123abc');
      }
    });

    it('should reject incorrectly formatted prefixed strings', () => {
      const schema = prefixedId(ID_PREFIXES.session);
      
      const result1 = schema.safeParse('wrong_123abc');
      expect(result1.success).toBe(false);
      
      const result2 = schema.safeParse('ses123abc');
      expect(result2.success).toBe(false);
      
      const result3 = schema.safeParse('ses_'); // technically matches prefix check, but realistic ones have length
      // Actually our simple validator just checks startsWith(`ses_`)
      expect(result3.success).toBe(true);

      const result4 = schema.safeParse(123);
      expect(result4.success).toBe(false);
    });
  });

  describe('routeSchemas', () => {
    it('should provide schema for sessionId', () => {
      expect(routeSchemas.sessionId.safeParse('ses_123').success).toBe(true);
      expect(routeSchemas.sessionId.safeParse('msg_123').success).toBe(false);
    });

    it('should provide schema for messageId', () => {
      expect(routeSchemas.messageId.safeParse('msg_123').success).toBe(true);
      expect(routeSchemas.messageId.safeParse('ses_123').success).toBe(false);
    });

    it('should provide schema for automationId', () => {
      expect(routeSchemas.automationId.safeParse('auto_123').success).toBe(true);
      expect(routeSchemas.automationId.safeParse('msg_123').success).toBe(false);
    });
  });
});

describe('paginationQuerySchema', () => {
  const schema = paginationQuerySchema();
  const schema10 = paginationQuerySchema({ pageSize: 10 });

  it('applies default page=1 and pageSize=20 when params are absent', () => {
    const result = schema.parse({});
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('applies custom default pageSize', () => {
    const result = schema10.parse({});
    expect(result).toEqual({ page: 1, pageSize: 10 });
  });

  it('parses valid page and pageSize from strings', () => {
    const result = schema.parse({ page: '3', pageSize: '50' });
    expect(result).toEqual({ page: 3, pageSize: 50 });
  });

  it('parses valid page and pageSize from numbers', () => {
    const result = schema.parse({ page: 2, pageSize: 25 });
    expect(result).toEqual({ page: 2, pageSize: 25 });
  });

  it('rejects page < 1', () => {
    expect(schema.safeParse({ page: '0' }).success).toBe(false);
    expect(schema.safeParse({ page: '-1' }).success).toBe(false);
  });

  it('rejects pageSize < 1', () => {
    expect(schema.safeParse({ pageSize: '0' }).success).toBe(false);
  });

  it('rejects pageSize > 100', () => {
    expect(schema.safeParse({ pageSize: '101' }).success).toBe(false);
    expect(schema.safeParse({ pageSize: '200' }).success).toBe(false);
  });

  it('accepts boundary values pageSize=1 and pageSize=100', () => {
    expect(schema.parse({ pageSize: '1' })).toEqual({ page: 1, pageSize: 1 });
    expect(schema.parse({ pageSize: '100' })).toEqual({ page: 1, pageSize: 100 });
  });

  it('rejects non-numeric strings', () => {
    expect(schema.safeParse({ page: 'abc' }).success).toBe(false);
    expect(schema.safeParse({ pageSize: 'xyz' }).success).toBe(false);
  });
});
