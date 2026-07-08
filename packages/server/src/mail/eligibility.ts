const REQUIRED_GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
] as const;

export type EligibleConnectorInstance = {
  id: string;
  connectorId: string;
  status: string;
  scopes: string[] | null;
  accountEmail: string | null;
};

type EligibleMailAccount = { connectorInstanceId: string; email: string };

export function hasRequiredGmailScopes(scopes: readonly string[] | null): boolean {
  return REQUIRED_GMAIL_SCOPES.every((scope) => scopes?.includes(scope));
}

export function filterEligibleMailAccounts(
  instances: readonly EligibleConnectorInstance[],
  enrolledConnectorInstanceIds: ReadonlySet<string>,
): EligibleMailAccount[] {
  return instances
    .filter(
      (instance) =>
        instance.connectorId === 'google' &&
        instance.status === 'connected' &&
        instance.accountEmail !== null &&
        !enrolledConnectorInstanceIds.has(instance.id) &&
        hasRequiredGmailScopes(instance.scopes),
    )
    .map((instance) => ({ connectorInstanceId: instance.id, email: instance.accountEmail! }));
}

export function assertCanEnrollMailAccount(instance: EligibleConnectorInstance | undefined): asserts instance is EligibleConnectorInstance & {
  accountEmail: string;
} {
  if (!instance) throw new Error('Connector instance not found');
  if (instance.connectorId !== 'google') throw new Error('Only Google connector instances can be enrolled for mail');
  if (instance.status !== 'connected') throw new Error('Google connector instance must be connected before mail enrollment');
  if (!instance.accountEmail) throw new Error('Google connector instance is missing an account email');
  if (!hasRequiredGmailScopes(instance.scopes)) {
    throw new Error('Google connector instance is missing required Gmail scopes: gmail.readonly, gmail.modify');
  }
}
