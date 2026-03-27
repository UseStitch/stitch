import { describe, expect, test } from 'vitest';

import { extractDomainForPermission } from '@/tools/core/webfetch.js';

describe('webfetch permission domain extraction', () => {
  test('extracts root domain from common hosts', () => {
    expect(extractDomainForPermission('https://medium.com/some/path')).toBe('medium.com');
    expect(extractDomainForPermission('https://www.medium.com/some/path')).toBe('medium.com');
  });

  test('upgrades http urls before parsing', () => {
    expect(extractDomainForPermission('http://example.com/post')).toBe('example.com');
  });

  test('handles second level tlds', () => {
    expect(extractDomainForPermission('https://news.bbc.co.uk/article')).toBe('bbc.co.uk');
  });

  test('returns null for invalid urls', () => {
    expect(extractDomainForPermission('not-a-url')).toBeNull();
  });
});
