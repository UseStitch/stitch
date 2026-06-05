import * as React from 'react';
import { toast } from 'sonner';

import { MCP_AUTH_TYPES } from '@stitch/shared/mcp/types';

import { HeaderRows } from './header-rows';
import { AUTH_TYPE_LABELS, type AddFormState, buildAuthConfig } from './shared';

import { SettingSubPage } from '@/components/settings/settings-ui';
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

export function AddCustomMcpServer({ onBack }: { onBack: () => void }) {
  const addServer = useAddMcpServer();

  const [form, setForm] = React.useState<AddFormState>({
    name: '',
    url: '',
    transport: 'http',
    authType: 'none',
    apiKey: '',
    headers: [],
  });

  const set = <K extends keyof AddFormState>(key: K, value: AddFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
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
      toast.success('MCP server added');
      onBack();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add MCP server');
    }
  };

  return (
    <SettingSubPage
      title="Add Custom MCP Server"
      description="Connect a remote MCP server manually."
      onBack={onBack}
      backLabel="Back to MCP servers"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Name</Label>
          <Input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. GitHub MCP"
          />
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
          <Button onClick={() => void handleSave()} disabled={addServer.isPending}>
            {addServer.isPending ? 'Adding...' : 'Add server'}
          </Button>
        </div>
      </div>
    </SettingSubPage>
  );
}
