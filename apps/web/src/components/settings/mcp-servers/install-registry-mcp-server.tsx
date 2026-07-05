import * as React from 'react';
import { toast } from 'sonner';

import { MCP_AUTH_TYPES } from '@stitch/shared/mcp/types';
import type { McpRegistryServer } from '@stitch/shared/mcp/types';

import { HeaderRows } from './header-rows';
import { OAuthFields } from './oauth-fields';
import {
  AUTH_TYPE_LABELS,
  EMPTY_ADD_FORM,
  applyAuthConfigToForm,
  buildAuthConfig,
  describeAuthConfig,
  type AddFormState,
} from './shared';

import { SettingSubPage } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

  const authOptions = React.useMemo(() => {
    const configs = [server.install.authConfig, ...(server.install.optionalAuthConfigs ?? [])];
    const uniqueByKey = new Map<string, (typeof configs)[number]>();
    for (const config of configs) {
      uniqueByKey.set(JSON.stringify(config), config);
    }
    return [...uniqueByKey.values()].map((config, index) => ({
      id: String(index),
      config,
      label: index === 0 ? `Default (${describeAuthConfig(config)})` : describeAuthConfig(config),
    }));
  }, [server.install.authConfig, server.install.optionalAuthConfigs]);

  const [selectedAuthId, setSelectedAuthId] = React.useState(authOptions[0]?.id ?? '0');
  const [form, setForm] = React.useState<AddFormState>(() =>
    applyAuthConfigToForm(
      { ...EMPTY_ADD_FORM, name: server.install.name, url: server.install.url, transport: server.install.transport },
      authOptions[0]?.config ?? server.install.authConfig,
    ),
  );

  const set = <K extends keyof AddFormState>(key: K, value: AddFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectedAuthOption = authOptions.find((entry) => entry.id === selectedAuthId) ?? authOptions[0];

  const handleAuthPresetChange = (id: string | null) => {
    if (!id) return;
    const option = authOptions.find((entry) => entry.id === id);
    setSelectedAuthId(id);
    if (!option) return;
    setForm((prev) => applyAuthConfigToForm(prev, option.config));
  };

  const handleInstall = async () => {
    const name = form.name.trim();
    const url = form.url.trim();

    if (!name) {
      toast.error('Name is required', { id: 'mcp-install-name' });
      return;
    }
    if (!url) {
      toast.error('URL is required', { id: 'mcp-install-url' });
      return;
    }
    if (form.authType === 'api_key' && !form.apiKey.trim()) {
      toast.error('API key is required', { id: 'mcp-install-apikey' });
      return;
    }

    try {
      const { id } = await addServer.mutateAsync({
        name,
        transport: form.transport,
        url,
        authConfig: buildAuthConfig(form),
      });
      if (form.authType === 'oauth') {
        await startAuth.mutateAsync(id);
        toast.success('Authorization started — complete it in your browser', { id: 'mcp-install-auth' });
      } else {
        toast.success(`${server.name} installed`, { id: 'mcp-install-success' });
      }
      onInstalled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to install MCP server', { id: 'mcp-install-error' });
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
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>

          {authOptions.length > 1 ? (
            <div className="space-y-1.5">
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
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground">Authentication</Label>
              <Select value={form.authType} onValueChange={(v) => set('authType', v as AddFormState['authType'])}>
                <SelectTrigger className="w-full">
                  <SelectValue>{AUTH_TYPE_LABELS[form.authType].label}</SelectValue>
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
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">URL</Label>
          <Input value={form.url} onChange={(e) => set('url', e.target.value)} type="url" />
        </div>

        {form.authType === 'api_key' && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">API Key</Label>
            <Input
              value={form.apiKey}
              onChange={(e) => set('apiKey', e.target.value)}
              placeholder="sk-..."
              type="password"
            />
          </div>
        )}

        {form.authType === 'headers' && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Headers</Label>
            <HeaderRows rows={form.headers} onChange={(rows) => set('headers', rows)} />
          </div>
        )}

        {form.authType === 'oauth' && <OAuthFields form={form} set={set} />}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onBack} disabled={isBusy}>
            Cancel
          </Button>
          <Button onClick={() => void handleInstall()} disabled={isBusy}>
            {isBusy ? 'Installing...' : 'Install server'}
          </Button>
        </div>
      </div>
    </SettingSubPage>
  );
}
