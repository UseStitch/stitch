import { describe, expect, it } from 'vitest';

import { buildUpgradeState, getCapabilitiesForVersion } from '@stitch-connectors/sdk/upgrade';
import type { ConnectorDefinition } from '@stitch/shared/connectors/types';

const definition: ConnectorDefinition = {
  id: 'example',
  name: 'Example',
  description: 'Example connector',
  icon: { type: 'simpleIcons', slug: 'example' },
  enabled: true,
  currentVersion: 3,
  versionHistory: [
    {
      version: 1,
      title: 'Initial',
      description: 'Initial release',
      action: 'none',
      capabilities: ['example.read'],
    },
    {
      version: 2,
      title: 'Write support',
      description: 'Adds write access',
      action: 'reauthorize',
      capabilities: ['example.write'],
      requiredScopes: ['scope:write'],
    },
    {
      version: 3,
      title: 'Admin support',
      description: 'Adds admin access',
      action: 'rotate_api_key',
      capabilities: ['example.admin'],
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
};

describe('connector upgrade helpers', () => {
  it('returns capabilities accumulated through the applied version', () => {
    expect(getCapabilitiesForVersion(definition, 1)).toEqual(['example.read']);
    expect(getCapabilitiesForVersion(definition, 2)).toEqual(['example.read', 'example.write']);
    expect(getCapabilitiesForVersion(definition, 3)).toEqual([
      'example.read',
      'example.write',
      'example.admin',
    ]);
  });

  it('returns null upgrade state when instance is up to date', () => {
    const upgrade = buildUpgradeState({
      definition,
      appliedVersion: 3,
      scopes: ['scope:read', 'scope:write'],
      capabilities: ['example.read', 'example.write', 'example.admin'],
    });

    expect(upgrade).toBeNull();
  });

  it('builds upgrade details for pending versions', () => {
    const upgrade = buildUpgradeState({
      definition,
      appliedVersion: 1,
      scopes: ['scope:read'],
      capabilities: ['example.read'],
    });

    expect(upgrade).not.toBeNull();
    expect(upgrade?.actions).toEqual(['reauthorize', 'rotate_api_key']);
    expect(upgrade?.missingScopes).toEqual(['scope:write']);
    expect(upgrade?.newCapabilities).toEqual(['example.write', 'example.admin']);
    expect(upgrade?.fromVersion).toBe(1);
    expect(upgrade?.toVersion).toBe(3);
  });

  it('captures reauthorization requirements for docs upgrades', () => {
    const docsDefinition: ConnectorDefinition = {
      ...definition,
      id: 'google',
      name: 'Google Workspace',
      currentVersion: 2,
      versionHistory: [
        {
          version: 1,
          title: 'Initial',
          description: 'Base connector',
          action: 'none',
          capabilities: ['google.drive.read'],
          requiredScopes: ['https://www.googleapis.com/auth/drive.readonly'],
        },
        {
          version: 2,
          title: 'Google Docs support',
          description: 'Adds Google Docs read and write support',
          action: 'reauthorize',
          capabilities: ['google.docs.read', 'google.docs.write'],
          requiredScopes: ['https://www.googleapis.com/auth/documents'],
        },
      ],
    };

    const upgrade = buildUpgradeState({
      definition: docsDefinition,
      appliedVersion: 1,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      capabilities: ['google.drive.read'],
    });

    expect(upgrade).not.toBeNull();
    expect(upgrade?.actions).toEqual(['reauthorize']);
    expect(upgrade?.missingScopes).toEqual(['https://www.googleapis.com/auth/documents']);
    expect(upgrade?.newCapabilities).toEqual(['google.docs.read', 'google.docs.write']);
    expect(upgrade?.toVersion).toBe(2);
  });
});
