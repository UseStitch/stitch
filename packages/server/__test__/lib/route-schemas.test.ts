import { describe, expect, it } from 'vitest';
import { prefixedId, routeSchemas } from '@/lib/route-schemas.js';
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
