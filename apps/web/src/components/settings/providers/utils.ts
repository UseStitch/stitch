import type { FieldDef } from '@stitch/shared/providers/types';

export type FieldValues = Record<string, string>;

type ProviderAuthMethod = {
  method: string;
  fields: FieldDef[];
};

export function resolveDefaultAuthMethod(
  existingMethod: string | undefined,
  enabledAuthMethods: ProviderAuthMethod[],
): string {
  const hasExistingMethod =
    existingMethod !== undefined &&
    enabledAuthMethods.some((authMethod) => authMethod.method === existingMethod);

  if (hasExistingMethod && existingMethod) {
    return existingMethod;
  }

  return enabledAuthMethods[0]?.method ?? '';
}

export function hydrateProviderConfigState(
  existingConfig: Record<string, unknown> | undefined,
  enabledAuthMethods: ProviderAuthMethod[],
): {
  activeMethod: string | null;
  authFields: FieldValues;
  extraFields: FieldValues;
} {
  if (!existingConfig) {
    return {
      activeMethod: null,
      authFields: {},
      extraFields: {},
    };
  }

  const method = (existingConfig.auth as { method?: string } | undefined)?.method;

  const authFields: FieldValues = {};
  const auth = existingConfig.auth as Record<string, unknown> | undefined;
  if (auth) {
    for (const [key, value] of Object.entries(auth)) {
      if (key !== 'method' && typeof value === 'string') {
        authFields[key] = value;
      }
    }
  }

  const extraFields: FieldValues = {};
  for (const [key, value] of Object.entries(existingConfig)) {
    if (key !== 'auth' && key !== 'providerId' && typeof value === 'string') {
      extraFields[key] = value;
    }
  }

  const isMethodEnabled =
    method !== undefined && enabledAuthMethods.some((authMethod) => authMethod.method === method);

  return {
    activeMethod: isMethodEnabled ? method : null,
    authFields,
    extraFields,
  };
}

export function buildProviderConfigBody({
  activeTab,
  enabledAuthMethods,
  currentMethodFields,
  extraFields,
  extraFieldDefs,
}: {
  activeTab: string;
  enabledAuthMethods: ProviderAuthMethod[];
  currentMethodFields: FieldValues;
  extraFields: FieldValues;
  extraFieldDefs: FieldDef[];
}): Record<string, unknown> {
  const auth: Record<string, unknown> = { method: activeTab };
  const methodDef = enabledAuthMethods.find((authMethod) => authMethod.method === activeTab);

  if (methodDef) {
    for (const field of methodDef.fields) {
      const value = currentMethodFields[field.key];
      if (value) {
        auth[field.key] = value;
      }
    }
  }

  const body: Record<string, unknown> = { auth };
  for (const field of extraFieldDefs) {
    const value = extraFields[field.key];
    if (value) {
      body[field.key] = value;
    }
  }

  return body;
}
