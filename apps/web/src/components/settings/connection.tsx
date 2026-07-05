import { LoaderIcon } from 'lucide-react';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ServerMode } from '@/lib/api';
import { serverConfigQueryOptions, useSaveServerConfig, useTestRemoteConnection } from '@/lib/queries/connection';
import { cn } from '@/lib/utils';

type TestState = { status: 'idle' } | { status: 'success'; message: string } | { status: 'error'; message: string };

const MODE_OPTIONS: { mode: ServerMode; label: string; description: string }[] = [
  { mode: 'local', label: 'Local server', description: 'Run the bundled Stitch server on this machine.' },
  {
    mode: 'remote',
    label: 'Remote server',
    description: 'Connect this desktop app to a Stitch server running elsewhere.',
  },
];

function ConnectionContent() {
  const page = SETTINGS_PAGE_BY_ID.connection;
  const Icon = page.icon;
  const { data: config } = useSuspenseQuery(serverConfigQueryOptions);
  const testRemote = useTestRemoteConnection();
  const saveConfig = useSaveServerConfig();

  const [mode, setMode] = React.useState<ServerMode>(config.mode);
  const [remoteUrl, setRemoteUrl] = React.useState(config.remoteUrl ?? '');
  const [testState, setTestState] = React.useState<TestState>({ status: 'idle' });

  React.useEffect(() => {
    setMode(config.mode);
    setRemoteUrl(config.remoteUrl ?? '');
  }, [config]);

  const hasChanges = mode !== config.mode || remoteUrl.trim() !== (config.remoteUrl ?? '');
  const remoteSelected = mode === 'remote';
  const saving = saveConfig.isPending;
  const testing = testRemote.isPending;

  function handleTestConnection() {
    if (!remoteUrl.trim()) {
      setTestState({ status: 'error', message: 'Remote server URL is required' });
      return;
    }

    setTestState({ status: 'idle' });
    testRemote.mutate(remoteUrl, {
      onSuccess: (result) => {
        if (!result.ok) {
          setTestState({ status: 'error', message: result.error ?? 'Connection failed' });
          return;
        }
        if (result.url) setRemoteUrl(result.url);
        setTestState({ status: 'success', message: 'Connection successful' });
      },
      onError: (error) => {
        setTestState({ status: 'error', message: error.message || 'Connection failed' });
      },
    });
  }

  function handleSave() {
    setTestState({ status: 'idle' });
    saveConfig.mutate({ mode, remoteUrl: remoteSelected ? remoteUrl : remoteUrl.trim() || null });
  }

  return (
    <div className="flex h-full flex-col">
      <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
        <SettingSection title="Server">
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
                )}>
                <span className="text-sm font-medium">{option.label}</span>
                <span className="mt-1 block text-xs text-muted-foreground">{option.description}</span>
              </button>
            ))}
          </div>
        </SettingSection>

        <SettingSection title="Connection details">
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
              disabled={!remoteSelected || testing || saving}>
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
            <p className={cn('text-xs', testState.status === 'success' ? 'text-success' : 'text-destructive')}>
              {testState.message}
            </p>
          ) : null}
        </SettingSection>

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
      </SettingPage>
    </div>
  );
}

export function ConnectionSettings() {
  return <ConnectionContent />;
}
