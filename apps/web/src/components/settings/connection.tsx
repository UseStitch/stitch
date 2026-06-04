import { LoaderIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ServerConnectionConfig, ServerMode } from '@/lib/api';
import { cn } from '@/lib/utils';

type TestState =
  | { status: 'idle' }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string };

const MODE_OPTIONS: { mode: ServerMode; label: string; description: string }[] = [
  {
    mode: 'local',
    label: 'Local server',
    description: 'Run the bundled Stitch server on this machine.',
  },
  {
    mode: 'remote',
    label: 'Remote server',
    description: 'Connect this desktop app to a Stitch server running elsewhere.',
  },
];

export function ConnectionSettings() {
  const [config, setConfig] = React.useState<ServerConnectionConfig | null>(null);
  const [mode, setMode] = React.useState<ServerMode>('local');
  const [remoteUrl, setRemoteUrl] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testState, setTestState] = React.useState<TestState>({ status: 'idle' });

  React.useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      const nextConfig = await window.api?.getServerConfig();
      if (cancelled || !nextConfig) return;
      setConfig(nextConfig);
      setMode(nextConfig.mode);
      setRemoteUrl(nextConfig.remoteUrl ?? '');
      setLoading(false);
    }

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges = config ? mode !== config.mode || remoteUrl.trim() !== (config.remoteUrl ?? '') : false;
  const remoteSelected = mode === 'remote';

  async function handleTestConnection() {
    if (!remoteUrl.trim()) {
      setTestState({ status: 'error', message: 'Remote server URL is required' });
      return;
    }

    setTesting(true);
    setTestState({ status: 'idle' });

    try {
      const result = await window.api?.server?.testRemote(remoteUrl);
      if (!result?.ok) {
        setTestState({ status: 'error', message: result?.error ?? 'Connection failed' });
        return;
      }
      if (result.url) setRemoteUrl(result.url);
      setTestState({ status: 'success', message: 'Connection successful' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setTestState({ status: 'idle' });

    try {
      const nextConfig = await window.api?.server?.setConfig({
        mode,
        remoteUrl: remoteSelected ? remoteUrl : remoteUrl.trim() || null,
      });
      if (!nextConfig) throw new Error('Server configuration is not available');
      setConfig(nextConfig);
      setMode(nextConfig.mode);
      setRemoteUrl(nextConfig.remoteUrl ?? '');
      toast.success('Server connection updated');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update server connection');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-base font-bold">Connection</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose whether Stitch connects to the local sidecar or a remote server.
        </p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Server</h3>
        <div className="grid grid-cols-2 gap-3">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              onClick={() => setMode(option.mode)}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                mode === option.mode
                  ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                  : 'border-border bg-background hover:bg-accent/50',
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <div>
          <Label htmlFor="remote-server-url" className="text-sm font-medium">
            Remote server URL
          </Label>
          <p className="mt-1 text-xs text-muted-foreground">
            Used only when remote server mode is selected. Example: http://192.168.1.10:3000
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            id="remote-server-url"
            value={remoteUrl}
            onChange={(event) => {
              setRemoteUrl(event.target.value);
              setTestState({ status: 'idle' });
            }}
            disabled={!remoteSelected || saving}
            placeholder="http://server.local:3000"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleTestConnection}
            disabled={!remoteSelected || testing || saving}
          >
            {testing ? (
              <>
                <LoaderIcon className="size-3.5 animate-spin" />
                Testing...
              </>
            ) : (
              'Test'
            )}
          </Button>
        </div>
        {testState.status !== 'idle' ? (
          <p
            className={cn(
              'text-xs',
              testState.status === 'success' ? 'text-success' : 'text-destructive',
            )}
          >
            {testState.message}
          </p>
        ) : null}
      </section>

      <div className="mt-8 flex items-center justify-between border-t pt-4">
        <p className="text-xs text-muted-foreground">
          Saving clears cached app data and reconnects to the selected server.
        </p>
        <Button type="button" onClick={handleSave} disabled={!hasChanges || saving}>
          {saving ? (
            <>
              <LoaderIcon className="size-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            'Save connection'
          )}
        </Button>
      </div>
    </div>
  );
}
