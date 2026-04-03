type OAuthCredentialCarrier = {
  clientId: string | null;
  clientSecret: string | null;
};

export async function resolveOAuthCredentials(
  instance: OAuthCredentialCarrier,
): Promise<{ clientId: string; clientSecret: string } | null> {
  if (instance.clientId && instance.clientSecret) {
    return { clientId: instance.clientId, clientSecret: instance.clientSecret };
  }
  return null;
}
