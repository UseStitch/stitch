import { describe, expect, test } from 'bun:test';

import { filterEligibleMailAccounts, hasRequiredGmailScopes, type EligibleConnectorInstance } from './eligibility.js';

const REQUIRED_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

function instance(patch: Partial<EligibleConnectorInstance>): EligibleConnectorInstance {
  return {
    id: 'conn_1',
    connectorId: 'google',
    status: 'connected',
    scopes: REQUIRED_SCOPES,
    accountEmail: 'user@example.com',
    ...patch,
  };
}

describe('hasRequiredGmailScopes', () => {
  test('requires readonly and modify scopes', () => {
    expect(hasRequiredGmailScopes(REQUIRED_SCOPES)).toBe(true);
    expect(hasRequiredGmailScopes(REQUIRED_SCOPES.slice(0, 1))).toBe(false);
    expect(hasRequiredGmailScopes(null)).toBe(false);
  });
});

describe('filterEligibleMailAccounts', () => {
  test('keeps connected Google instances with Gmail scopes that are not enrolled', () => {
    const rows = [
      instance({ id: 'conn_eligible' }),
      instance({ id: 'conn_enrolled' }),
      instance({ id: 'conn_disconnected', status: 'error' }),
      instance({ id: 'conn_wrong_provider', connectorId: 'slack' }),
      instance({ id: 'conn_missing_scope', scopes: REQUIRED_SCOPES.slice(0, 1) }),
      instance({ id: 'conn_missing_email', accountEmail: null }),
    ];

    expect(filterEligibleMailAccounts(rows, new Set(['conn_enrolled']))).toEqual([
      { connectorInstanceId: 'conn_eligible', email: 'user@example.com' },
    ]);
  });
});
