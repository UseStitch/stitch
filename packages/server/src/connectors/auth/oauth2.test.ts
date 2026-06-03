import { describe, expect, test } from 'bun:test';

import { OAuthRefreshError, requiresOAuthReauth } from '@/connectors/auth/oauth2.js';

function invalidGrant(clockSkewMs?: number): OAuthRefreshError {
  return new OAuthRefreshError(
    400,
    JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }),
    clockSkewMs,
  );
}

describe('requiresOAuthReauth', () => {
  test('flags invalid_grant without clock skew as requiring reauthorization', () => {
    expect(requiresOAuthReauth(invalidGrant())).toBe(true);
  });

  test('flags invalid_grant with small clock skew as requiring reauthorization', () => {
    expect(requiresOAuthReauth(invalidGrant(60_000))).toBe(true);
  });

  test('treats invalid_grant with large clock skew as transient', () => {
    expect(requiresOAuthReauth(invalidGrant(10 * 60_000))).toBe(false);
    expect(requiresOAuthReauth(invalidGrant(-10 * 60_000))).toBe(false);
  });

  test('does not flag non-invalid_grant errors', () => {
    expect(requiresOAuthReauth(new OAuthRefreshError(500, 'server error'))).toBe(false);
    expect(requiresOAuthReauth(new OAuthRefreshError(400, JSON.stringify({ error: 'invalid_client' })))).toBe(false);
  });

  test('does not flag arbitrary errors', () => {
    expect(requiresOAuthReauth(new Error('socket hang up'))).toBe(false);
  });
});
