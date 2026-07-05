import * as React from 'react';
import { toast } from 'sonner';

import { MCP_AUTH_TYPES } from '@stitch/shared/mcp/types';

import { HeaderRows } from './header-rows';
import { OAuthFields } from './oauth-fields';
import { AUTH_TYPE_LABELS, type AddFormState, EMPTY_ADD_FORM, buildAuthConfig } from './shared';

import { SettingSubPage } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getErrorMessage } from '@/lib/errors';
import { useAddMcpServer, useStartMcpAuth } from '@/lib/queries/mcp';

export function AddCustomMcpServer({ onBack }: { onBack: () => void }) {
  const addServer = useAddMcpServer();
  const startAuth = useStartMcpAuth();

  const [form, setForm] = React.useState<AddFormState>(EMPTY_ADD_FORM);

  const set = <K extends keyof AddFormState>(key: K, value: AddFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    const name = form.name.trim();
    const url = form.url.trim();

    if (!name) {
      toast.error('Name is required', { id: 'mcp-add-name' });
      return;
    }
    if (!url) {
      toast.error('URL is required', { id: 'mcp-add-url' });
      return;
    }
    if (form.authType === 'api_key' && !form.apiKey.trim()) {
      toast.error('API key is required', { id: 'mcp-add-apikey' });
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
        toast.success('Authorization started — complete it in your browser', { id: 'mcp-add-auth' });
      } else {
        toast.success('MCP server added', { id: 'mcp-add-success' });
      }
      onBack();
    } catch (error) {
      toast.error(getErrorMessage(error, 'Failed to add MCP server'), { id: 'mcp-add-error' });
    }
  };

  const isBusy = addServer.isPending || startAuth.isPending;

  return (
    <SettingSubPage
      title="Add Custom MCP Server"
      description="Connect a remote MCP server manually."
      onBack={onBack}
      backLabel="Back to MCP servers">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. GitHub MCP" />
          </div>

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
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">URL</Label>
          <Input
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder="https://mcp.example.com"
            type="url"
          />
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
          <Button onClick={() => void handleSave()} disabled={isBusy}>
            {isBusy ? 'Adding...' : 'Add server'}
          </Button>
        </div>
      </div>
    </SettingSubPage>
  );
}
