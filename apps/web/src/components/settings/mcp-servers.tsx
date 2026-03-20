import { ArrowLeftIcon, EyeIcon, PlusIcon, Trash2Icon, WrenchIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useQuery, useSuspenseQuery } from '@tanstack/react-query';

import type { McpAuthConfig, McpAuthType, McpServer } from '@stitch/shared/mcp/types';
import { MCP_AUTH_TYPES } from '@stitch/shared/mcp/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mcpServersQueryOptions, mcpToolsQueryOptions, useAddMcpServer, useDeleteMcpServer } from '@/lib/queries/mcp';

const AUTH_TYPE_LABELS: Record<McpAuthType, { label: string; description: string }> = {
  none: { label: 'No auth', description: 'Open server, no credentials needed' },
  api_key: { label: 'API key', description: 'Bearer token sent as Authorization header' },
  headers: { label: 'Custom headers', description: 'Arbitrary static headers (e.g. X-API-Token)' },
};

type HeaderEntry = { key: string; value: string };

type AddFormState = {
  name: string;
  url: string;
  authType: McpAuthType;
  apiKey: string;
  headers: HeaderEntry[];
};

function buildAuthConfig(form: AddFormState): McpAuthConfig {
  if (form.authType === 'api_key') {
    return { type: 'api_key', apiKey: form.apiKey };
  }
  if (form.authType === 'headers') {
    const headers: Record<string, string> = {};
    for (const { key, value } of form.headers) {
      if (key.trim()) headers[key.trim()] = value;
    }
    return { type: 'headers', headers };
  }
  return { type: 'none' };
}

function HeaderRows({
  rows,
  onChange,
}: {
  rows: HeaderEntry[];
  onChange: (rows: HeaderEntry[]) => void;
}) {
  const update = (index: number, field: 'key' | 'value', val: string) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, [field]: val } : r)));
  };

  const remove = (index: number) => {
    onChange(rows.filter((_, i) => i !== index));
  };

  const add = () => {
    onChange([...rows, { key: '', value: '' }]);
  };

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="Header name"
            value={row.key}
            onChange={(e) => update(i, 'key', e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Value"
            value={row.value}
            onChange={(e) => update(i, 'value', e.target.value)}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => remove(i)}
            aria-label="Remove header"
          >
            <Trash2Icon className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add} type="button">
        Add header
      </Button>
    </div>
  );
}

function McpToolsPreview({ server, onBack }: { server: McpServer; onBack: () => void }) {
  const { data: tools, isLoading, isError, error } = useQuery(mcpToolsQueryOptions(server.id));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to MCP servers">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h2 className="text-base font-bold">{server.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Available tools</p>
        </div>
      </div>

      {isLoading && (
        <p className="text-sm text-muted-foreground">Connecting to server...</p>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Failed to load tools'}
        </p>
      )}

      {tools && tools.length === 0 && (
        <p className="text-sm text-muted-foreground">No tools exposed by this server.</p>
      )}

      {tools && tools.length > 0 && (
        <ul className="space-y-2">
          {tools.map((tool) => (
            <li
              key={tool.name}
              className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-2.5"
            >
              <WrenchIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">{tool.name}</p>
                {tool.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{tool.description}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddMcpServer({ onBack }: { onBack: () => void }) {
  const addServer = useAddMcpServer();

  const [form, setForm] = React.useState<AddFormState>({
    name: '',
    url: '',
    authType: 'none',
    apiKey: '',
    headers: [],
  });

  const set = <K extends keyof AddFormState>(key: K, value: AddFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

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
        transport: 'http',
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
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to MCP servers">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <h2 className="text-base font-bold">Add MCP Server</h2>
          <p className="mt-1 text-sm text-muted-foreground">Connect a remote MCP server</p>
        </div>
      </div>

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
            onValueChange={(v) => set('authType', v as McpAuthType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {AUTH_TYPE_LABELS[form.authType].label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-72" alignItemWithTrigger={false}>
              {MCP_AUTH_TYPES.map((type) => (
                <SelectItem key={type} value={type} className="items-start py-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{AUTH_TYPE_LABELS[type].label}</span>
                    <span className="text-xs text-muted-foreground leading-snug">{AUTH_TYPE_LABELS[type].description}</span>
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
            <HeaderRows
              rows={form.headers}
              onChange={(rows) => set('headers', rows)}
            />
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
    </div>
  );
}

function McpServerList({
  onAdd,
  onPreview,
}: {
  onAdd: () => void;
  onPreview: (server: McpServer) => void;
}) {
  const { data: servers } = useSuspenseQuery(mcpServersQueryOptions);
  const deleteServer = useDeleteMcpServer();

  const handleDelete = async (server: McpServer) => {
    try {
      await deleteServer.mutateAsync(server.id);
      toast.success(`${server.name} removed`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove MCP server');
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">MCP Servers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure remote Model Context Protocol servers
          </p>
        </div>
        <Button size="icon-sm" onClick={onAdd} aria-label="Add MCP server">
          <PlusIcon className="size-4" />
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60">
        {servers.length === 0 && (
          <p className="px-4 py-5 text-sm text-muted-foreground">No MCP servers configured.</p>
        )}

        {servers.map((server) => (
          <div
            key={server.id}
            className="flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3 last:border-b-0"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{server.name}</p>
                <Badge variant="secondary" className="shrink-0 text-[11px]">
                  {AUTH_TYPE_LABELS[server.authConfig.type].label}
                </Badge>
              </div>
              <p className="truncate text-xs text-muted-foreground">{server.url}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => onPreview(server)}
                aria-label={`Preview tools for ${server.name}`}
              >
                <EyeIcon className="size-3.5" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void handleDelete(server)}
                disabled={deleteServer.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type View =
  | { type: 'list' }
  | { type: 'add' }
  | { type: 'preview'; server: McpServer };

function McpServersContent() {
  const [view, setView] = React.useState<View>({ type: 'list' });

  if (view.type === 'add') {
    return <AddMcpServer onBack={() => setView({ type: 'list' })} />;
  }

  if (view.type === 'preview') {
    return (
      <McpToolsPreview
        server={view.server}
        onBack={() => setView({ type: 'list' })}
      />
    );
  }

  return (
    <McpServerList
      onAdd={() => setView({ type: 'add' })}
      onPreview={(server) => setView({ type: 'preview', server })}
    />
  );
}

export function McpServersSettings() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <McpServersContent />
    </React.Suspense>
  );
}
