import type {
  ConnectorDefinition,
  ConnectorUpgradeAction,
  ConnectorUpgradeState,
  ConnectorVersion,
} from '@stitch/shared/connectors/types';

function getSortedVersions(definition: ConnectorDefinition): ConnectorVersion[] {
  return [...definition.versionHistory].toSorted((a, b) => a.version - b.version);
}

export function getCapabilitiesForVersion(definition: ConnectorDefinition, appliedVersion: number): string[] {
  return [
    ...new Set(
      definition.versionHistory
        .filter((version) => version.version <= appliedVersion)
        .flatMap((version) => version.capabilities),
    ),
  ];
}

function getPendingVersions(definition: ConnectorDefinition, appliedVersion: number): ConnectorVersion[] {
  return getSortedVersions(definition).filter(
    (version) => version.version > appliedVersion && version.version <= definition.currentVersion,
  );
}

export function buildUpgradeState(input: {
  definition: ConnectorDefinition;
  appliedVersion: number;
  scopes: string[] | null;
  capabilities: string[];
}): ConnectorUpgradeState {
  const fromVersion = input.appliedVersion;
  const toVersion = input.definition.currentVersion;
  const pendingVersions = getPendingVersions(input.definition, fromVersion);
  const latestVersion = pendingVersions.at(-1);

  if (fromVersion >= toVersion || !latestVersion) {
    return null;
  }

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
  const newCapabilities = targetCapabilities.filter((capability) => !currentCapabilities.has(capability));

  return {
    available: true,
    fromVersion,
    toVersion,
    actions: [...actionSet],
    title: latestVersion.title,
    description: latestVersion.description,
    missingScopes,
    newCapabilities,
  };
}
