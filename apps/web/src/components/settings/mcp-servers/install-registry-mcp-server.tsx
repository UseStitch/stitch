import * as React from 'react';
import { toast } from 'sonner';

import { useForm, useStore } from '@tanstack/react-form';

import { MCP_AUTH_TYPES } from '@stitch/shared/mcp/types';
import type { McpRegistryServer } from '@stitch/shared/mcp/types';

import { HeaderRows } from './header-rows';
import { OAuthFields } from './oauth-fields';
import {
  AUTH_TYPE_LABELS,
  EMPTY_ADD_FORM,
  addMcpServerSchema,
  applyAuthConfigToForm,
  buildAuthConfig,
  describeAuthConfig,
  type AddFormState,
} from './shared';

import { SettingSubPage } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { FieldError, fieldErrorMessage } from '@/components/ui/field-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/errors';
import { useAddMcpServer, useStartMcpAuth } from '@/lib/queries/mcp';

export function InstallRegistryMcpServer({
  server,
  onBack,
  onInstalled,
}: {
  server: McpRegistryServer;
  onBack: () => void;
  onInstalled: () => void;
}) {
  const addServer = useAddMcpServer();
  const startAuth = useStartMcpAuth();

  const configs = [server.install.authConfig, ...(server.install.optionalAuthConfigs ?? [])];
  const uniqueByKey = new Map<string, (typeof configs)[number]>();
  for (const config of configs) {
    uniqueByKey.set(JSON.stringify(config), config);
  }
  const authOptions = [...uniqueByKey.values()].map((config, index) => ({
    id: String(index),
    config,
    label: index === 0 ? `Default (${describeAuthConfig(config)})` : describeAuthConfig(config),
  }));

  const [selectedAuthId, setSelectedAuthId] = React.useState(authOptions[0]?.id ?? '0');
  const form = useForm({
    defaultValues: applyAuthConfigToForm(
      { ...EMPTY_ADD_FORM, name: server.install.name, url: server.install.url, transport: server.install.transport },
      authOptions[0]?.config ?? server.install.authConfig,
    ),
    validators: { onMount: addMcpServerSchema, onChange: addMcpServerSchema },
    onSubmit: async ({ value }) => {
      let id: string;
      try {
        ({ id } = await addServer.mutateAsync({
          name: value.name.trim(),
          transport: value.transport,
          url: value.url.trim(),
          authConfig: buildAuthConfig(value),
        }));
      } catch (error) {
        toast.error(getErrorMessage(error, 'Failed to install MCP server'), { id: 'mcp-install-error' });
        return;
      }

      toast.success(`${server.name} installed`, { id: 'mcp-install-success' });
      onInstalled();

      if (value.authType === 'oauth') {
        try {
          await startAuth.mutateAsync(id);
          toast.success('Authorization started - complete it in your browser', { id: 'mcp-install-auth' });
        } catch (error) {
          toast.error(getErrorMessage(error, `${server.name} installed, but authorization failed to start`), {
            id: 'mcp-install-auth',
          });
        }
      }
    },
  });

  const values = useStore(form.store, (state) => state.values);
  const set = (key: 'oauthScopes' | 'oauthClientId' | 'oauthClientSecret', value: string) => {
    form.setFieldValue(key, value);
  };

  const selectedAuthOption = authOptions.find((entry) => entry.id === selectedAuthId) ?? authOptions[0];

  const handleAuthPresetChange = (id: string | null) => {
    if (!id) return;
    const option = authOptions.find((entry) => entry.id === id);
    setSelectedAuthId(id);
    if (!option) return;
    const nextValues = applyAuthConfigToForm(values, option.config);
    const authKeys = ['authType', 'apiKey', 'headers', 'oauthScopes', 'oauthClientId', 'oauthClientSecret'] as const;
    for (const key of authKeys) {
      form.setFieldValue(key, nextValues[key]);
    }
  };

  const isBusy = addServer.isPending || startAuth.isPending;

  return (
    <SettingSubPage
      title={`Install ${server.name}`}
      description={server.description}
      onBack={onBack}
      backLabel="Back to marketplace"
      actions={
        <a
          href={server.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted-foreground underline hover:text-foreground">
          View docs
        </a>
      }>
      <form
        className="space-y-space-xl"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}>
        <div className="grid grid-cols-2 gap-space-xl">
          <form.Field name="name">
            {(field) => (
              <div className="space-y-space-s">
                <Label className="text-xs font-medium text-muted-foreground">Name</Label>
                <Input
                  value={field.state.value}
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>

          {authOptions.length > 1 ? (
            <div className="space-y-space-s">
              <Label className="text-xs font-medium text-muted-foreground">Auth preset</Label>
              <Select value={selectedAuthId} onValueChange={handleAuthPresetChange}>
                <SelectTrigger className="w-full">
                  <SelectValue>{selectedAuthOption?.label ?? 'Select auth preset'}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {authOptions.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <form.Field name="authType">
              {(field) => (
                <div className="space-y-space-s">
                  <Label className="text-xs font-medium text-muted-foreground">Authentication</Label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => field.handleChange(value as AddFormState['authType'])}>
                    <SelectTrigger className="w-full">
                      <SelectValue>{AUTH_TYPE_LABELS[field.state.value].label}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {MCP_AUTH_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {AUTH_TYPE_LABELS[type].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>
          )}
        </div>

        <form.Field name="url">
          {(field) => (
            <div className="space-y-space-s">
              <Label className="text-xs font-medium text-muted-foreground">URL</Label>
              <Input
                value={field.state.value}
                type="url"
                aria-invalid={!!fieldErrorMessage(field.state.meta)}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
              />
              <FieldError meta={field.state.meta} />
            </div>
          )}
        </form.Field>

        {values.authType === 'api_key' && (
          <form.Field name="apiKey">
            {(field) => (
              <div className="space-y-space-s">
                <Label className="text-xs font-medium text-muted-foreground">API Key</Label>
                <Input
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="sk-..."
                  type="password"
                  aria-invalid={!!fieldErrorMessage(field.state.meta)}
                />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>
        )}

        {values.authType === 'headers' && (
          <form.Field name="headers">
            {(field) => (
              <div className="space-y-space-s">
                <Label className="text-xs font-medium text-muted-foreground">Headers</Label>
                <HeaderRows rows={field.state.value} onChange={field.handleChange} />
                <FieldError meta={field.state.meta} />
              </div>
            )}
          </form.Field>
        )}

        {values.authType === 'oauth' && <OAuthFields form={values} set={set} />}

        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <div className="flex justify-end gap-space-m pt-space-m">
              <Button type="button" variant="outline" onClick={onBack} disabled={isBusy || isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isBusy || isSubmitting}>
                {isBusy ? 'Installing...' : 'Install server'}
              </Button>
            </div>
          )}
        </form.Subscribe>
      </form>
    </SettingSubPage>
  );
}
