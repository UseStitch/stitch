import type {
  ConnectorDefinition,
  ConnectorInstanceSafe,
  ConnectorUpgradeAction,
  ConnectorVersion,
} from '@stitch/shared/connectors/types';

function getSortedVersions(definition: ConnectorDefinition): ConnectorVersion[] {
  return [...definition.versionHistory].sort((a, b) => a.version - b.version);
}

export function getCapabilitiesForVersion(
  definition: ConnectorDefinition,
  appliedVersion: number,
): string[] {
  const capabilities = new Set<string>();
  for (const version of getSortedVersions(definition)) {
    if (version.version > appliedVersion) {
      continue;
    }
    for (const capability of version.capabilities) {
      capabilities.add(capability);
    }
  }
  return [...capabilities];
}

function getPendingVersions(
  definition: ConnectorDefinition,
  appliedVersion: number,
): ConnectorVersion[] {
  return getSortedVersions(definition).filter(
    (version) => version.version > appliedVersion && version.version <= definition.currentVersion,
  );
}

export function buildUpgradeState(input: {
  definition: ConnectorDefinition;
  appliedVersion: number;
  scopes: string[] | null;
  capabilities: string[];
}): ConnectorInstanceSafe['upgrade'] {
  const fromVersion = Math.max(1, input.appliedVersion);
  const toVersion = input.definition.currentVersion;

  if (fromVersion >= toVersion) {
    return null;
  }

  const pendingVersions = getPendingVersions(input.definition, fromVersion);
  const actionSet = new Set<ConnectorUpgradeAction>();
  const requiredScopes = new Set<string>();

  for (const version of pendingVersions) {
    if (version.action !== 'none') {
      actionSet.add(version.action);
    }
    for (const scope of version.requiredScopes ?? []) {
      requiredScopes.add(scope);
    }
  }

  const grantedScopes = new Set(input.scopes ?? []);
  const missingScopes = [...requiredScopes].filter((scope) => !grantedScopes.has(scope));

  const targetCapabilities = getCapabilitiesForVersion(input.definition, toVersion);
  const currentCapabilities = new Set(input.capabilities);
  const newCapabilities = targetCapabilities.filter(
    (capability) => !currentCapabilities.has(capability),
  );

  const latestVersion = pendingVersions[pendingVersions.length - 1];

  return {
    available: true,
    fromVersion,
    toVersion,
    actions: [...actionSet],
    title: latestVersion?.title ?? `Upgrade ${input.definition.name}`,
    description: latestVersion?.description ?? 'A connector upgrade is available.',
    missingScopes,
    newCapabilities,
  };
}
