import * as React from 'react';
import { toast } from 'sonner';

import { MCP_AUTH_TYPES } from '@stitch/shared/mcp/types';
import type { McpRegistryServer } from '@stitch/shared/mcp/types';

import { HeaderRows } from './header-rows';
import {
  AUTH_TYPE_LABELS,
  applyAuthConfigToForm,
  buildAuthConfig,
  describeAuthConfig,
  type AddFormState,
} from './shared';

import { SettingSubPage } from '@/components/settings/settings-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAddMcpServer } from '@/lib/queries/mcp';

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
      {
        name: server.install.name,
        url: server.install.url,
        transport: server.install.transport,
        authType: 'none',
        apiKey: '',
        headers: [],
      },
      authOptions[0]?.config ?? server.install.authConfig,
    ),
  );

  const set = <K extends keyof AddFormState>(key: K, value: AddFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectedAuthOption =
    authOptions.find((entry) => entry.id === selectedAuthId) ?? authOptions[0];

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
      toast.error('Name is required');
      return;
    }
    if (!url) {
      toast.error('URL is required');
      return;
    }
    if (form.authType === 'api_key' && !form.apiKey.trim()) {
      toast.error('API key is required');
      return;
    }

    try {
      await addServer.mutateAsync({
        name,
        transport: form.transport,
        url,
        authConfig: buildAuthConfig(form),
      });
      toast.success(`${server.name} installed`);
      onInstalled();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to install MCP server');
    }
  };

  return (
    <SettingSubPage
      title={`Install ${server.name}`}
      description="Review connection settings before adding."
      onBack={onBack}
      backLabel="Back to marketplace"
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border/60 px-3 py-2.5 text-xs text-muted-foreground">
          <p>{server.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{server.install.transport.toUpperCase()}</Badge>
            <a href={server.docsUrl} target="_blank" rel="noreferrer" className="underline">
              View docs
            </a>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Name</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">URL</Label>
          <Input value={form.url} onChange={(e) => set('url', e.target.value)} type="url" />
        </div>

        {authOptions.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Auth preset</Label>
            <Select value={selectedAuthId} onValueChange={handleAuthPresetChange}>
              <SelectTrigger className="w-full">
                <SelectValue>{selectedAuthOption?.label ?? 'Select auth preset'}</SelectValue>
              </SelectTrigger>
              <SelectContent className="w-72" alignItemWithTrigger={false}>
                {authOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Authentication</Label>
          <Select
            value={form.authType}
            onValueChange={(v) => set('authType', v as AddFormState['authType'])}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{AUTH_TYPE_LABELS[form.authType].label}</SelectValue>
            </SelectTrigger>
            <SelectContent className="w-72" alignItemWithTrigger={false}>
              {MCP_AUTH_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="items-start py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{AUTH_TYPE_LABELS[type].label}</span>
                    <span className="text-xs leading-snug text-muted-foreground">
                      {AUTH_TYPE_LABELS[type].description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onBack} disabled={addServer.isPending}>
            Cancel
          </Button>
          <Button onClick={() => void handleInstall()} disabled={addServer.isPending}>
            {addServer.isPending ? 'Installing...' : 'Install server'}
          </Button>
        </div>
      </div>
    </SettingSubPage>
  );
}
