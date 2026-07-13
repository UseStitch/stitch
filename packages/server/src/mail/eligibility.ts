import {
  MailConnectorInstanceNotFoundError,
  MailConnectorNotConnectedError,
  MailConnectorNotGoogleError,
  MailMissingAccountEmailError,
  MailMissingScopesError,
} from '@/mail/errors.js';

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

export function assertCanEnrollMailAccount(
  instance: EligibleConnectorInstance | undefined,
): asserts instance is EligibleConnectorInstance & { accountEmail: string } {
  if (!instance) throw new MailConnectorInstanceNotFoundError();
  if (instance.connectorId !== 'google') throw new MailConnectorNotGoogleError(instance.connectorId);
  if (instance.status !== 'connected') throw new MailConnectorNotConnectedError(instance.status);
  if (!instance.accountEmail) throw new MailMissingAccountEmailError();
  if (!hasRequiredGmailScopes(instance.scopes)) {
    throw new MailMissingScopesError();
  }
}
