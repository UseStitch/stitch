import { z } from 'zod';

import type { JsonObject } from '@stitch/shared/json';
import type { FieldDef } from '@stitch/shared/providers/types';

export type FieldValues = Record<string, string>;

type ProviderAuthMethod = { method: string; fields: FieldDef[] };

const providerConfigSchema = z.record(z.string(), z.union([z.string(), z.record(z.string(), z.string())]));
const authConfigSchema = z.object({ method: z.string() }).catchall(z.string());

export function resolveDefaultAuthMethod(
  existingMethod: string | undefined,
  enabledAuthMethods: ProviderAuthMethod[],
): string {
  const hasExistingMethod =
    existingMethod !== undefined && enabledAuthMethods.some((authMethod) => authMethod.method === existingMethod);

  if (hasExistingMethod && existingMethod) {
    return existingMethod;
  }

  return enabledAuthMethods.at(0)?.method ?? '';
}

export function hydrateProviderConfigState(
  existingConfig: JsonObject | undefined,
  enabledAuthMethods: ProviderAuthMethod[],
): ProviderConfigState {
  if (!existingConfig) {
    return { activeMethod: null, authFields: {}, extraFields: {} };
  }

  const parsedConfig = providerConfigSchema.safeParse(existingConfig);
  if (!parsedConfig.success) return { activeMethod: null, authFields: {}, extraFields: {} };

  const parsedAuth = authConfigSchema.safeParse(parsedConfig.data.auth);
  const method = parsedAuth.success ? parsedAuth.data.method : undefined;
  const authFields: FieldValues = {};
  if (parsedAuth.success) {
    for (const [key, value] of Object.entries(parsedAuth.data)) {
      if (key !== 'method') {
        authFields[key] = value;
      }
    }
  }

  const extraFields: FieldValues = {};
  for (const [key, value] of Object.entries(parsedConfig.data)) {
    const parsedValue = z.string().safeParse(value);
    if (key !== 'auth' && key !== 'providerId' && parsedValue.success) {
      extraFields[key] = parsedValue.data;
    }
  }

  const isMethodEnabled = method !== undefined && enabledAuthMethods.some((authMethod) => authMethod.method === method);

  return { activeMethod: isMethodEnabled ? method : null, authFields, extraFields };
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
}): ProviderConfigBody {
  const methodDef = enabledAuthMethods.find((authMethod) => authMethod.method === activeTab);
  const authFields: FieldValues = Object.fromEntries(
    (methodDef?.fields ?? []).flatMap((field): [string, string][] => {
      const value = currentMethodFields[field.key];
      return value ? [[field.key, value]] : [];
    }),
  );
  const configuredExtraFields: FieldValues = Object.fromEntries(
    extraFieldDefs.flatMap((field): [string, string][] => {
      const value = extraFields[field.key];
      return value ? [[field.key, value]] : [];
    }),
  );

  return { auth: { method: activeTab, ...authFields }, ...configuredExtraFields };
}

export type ProviderConfigState = { activeMethod: string | null; authFields: FieldValues; extraFields: FieldValues };
export type ProviderConfigBody = { auth: { method: string } & FieldValues } & Record<
  string,
  string | Record<string, string>
>;
