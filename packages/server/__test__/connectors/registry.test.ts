import { describe, expect, test } from 'vitest';

import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

import { registerConnector } from '@/connectors/registry.js';

function buildDefinition(overrides: Partial<ConnectorDefinition> = {}): ConnectorDefinition {
  return {
    id: 'registry-test',
    name: 'Registry Test',
    description: 'Registry validation test',
    icon: { type: 'simpleIcons', slug: 'test' },
    enabled: true,
    currentVersion: 2,
    versionHistory: [
      {
        version: 1,
        title: 'Initial',
        description: 'Initial',
        action: 'none',
        capabilities: ['registry.read'],
      },
      {
        version: 2,
        title: 'Upgrade',
        description: 'Upgrade',
        action: 'reauthorize',
        capabilities: ['registry.write'],
      },
    ],
    authType: 'oauth2',
    authConfig: {
      authUrl: 'https://example.com/auth',
      tokenUrl: 'https://example.com/token',
      defaultScopes: ['scope:read'],
      scopeDescriptions: {
        'scope:read': 'Read access',
      },
    },
    setupInstructions: [],
    ...overrides,
  };
}

describe('connector registry definition validation', () => {
  test('rejects empty version history', () => {
    expect(() => {
      registerConnector(
        buildDefinition({
          id: 'registry-empty',
          versionHistory: [],
          currentVersion: 1,
        }),
      );
    }).toThrow('must define at least one version');
  });

  test('rejects duplicate version numbers', () => {
    expect(() => {
      registerConnector(
        buildDefinition({
          id: 'registry-duplicate',
          currentVersion: 1,
          versionHistory: [
            {
              version: 1,
              title: 'Initial',
              description: 'Initial',
              action: 'none',
              capabilities: ['registry.read'],
            },
            {
              version: 1,
              title: 'Duplicate',
              description: 'Duplicate',
              action: 'none',
              capabilities: ['registry.write'],
            },
          ],
        }),
      );
    }).toThrow('duplicate version');
  });

  test('rejects mismatched current version', () => {
    expect(() => {
      registerConnector(
        buildDefinition({
          id: 'registry-mismatch',
          currentVersion: 1,
        }),
      );
    }).toThrow('must match highest versionHistory entry');
  });
});
