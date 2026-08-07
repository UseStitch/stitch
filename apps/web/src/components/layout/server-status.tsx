import { Check, HardDrive } from 'lucide-react';
import * as React from 'react';
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import {
  formatEventBusSubtitle,
  STATE_COLOR,
  toEventBusState,
  toServerState,
  worstState,
  type StatusState,
} from './server-status-state';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { StatusDot } from '@/components/ui/status-dot';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSSE } from '@/hooks/sse/sse-context';
import { serverFetch, type ServerConnectionConfig } from '@/lib/api';

const HEALTH_POLL_INTERVAL_MS = 10_000;
const HEALTH_TIMEOUT_MS = 5_000;

function useServerConfig() {
  const [config, setConfig] = React.useState<ServerConnectionConfig | null>(null);

  React.useEffect(() => {
    void window.api.getServerConfig().then(setConfig);
    return window.api.server.onConfigChanged(setConfig);
  }, []);

  return config;
}

/** Re-renders on an interval so relative timestamps keep counting up. */
function useTicker(active: boolean) {
  const [, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => clearInterval(id);
  }, [active]);
}

export function ServerStatus() {
  const [isOpen, setIsOpen] = useState(false);
  const serverConfig = useServerConfig();

  const { data: isHealthy } = useQuery({
    queryKey: ['health', serverConfig?.url],
    queryFn: async () => {
      // Without a timeout a zombie server leaves this pending forever, and the
      // poll never fires again because a request is still in flight.
      const res = await serverFetch('/health', { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }).catch(() => null);
      return res?.ok ?? false;
    },
    refetchInterval: HEALTH_POLL_INTERVAL_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });

  const { status: sseStatus, lastHeartbeat } = useSSE();

  useTicker(isOpen);

  const serverState = toServerState(isHealthy);
  const eventBusState = toEventBusState(sseStatus);
  const overallState = worstState(serverState, eventBusState);

  const serverLabel = serverConfig?.mode === 'remote' ? 'Remote Server' : 'Local Server';
  const serverSubtitle = serverConfig?.mode === 'remote' ? serverConfig.url : undefined;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        className="relative flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-accent"
        aria-label="Server status">
        <Icon as={HardDrive} size="s" tone="muted" />
        <StatusDot color={STATE_COLOR[overallState]} bordered className="absolute top-1 right-1" />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-70 overflow-hidden rounded-xl border-border p-space-none shadow-lg">
        <Tabs defaultValue="servers" className="gap-space-none">
          <div className="bg-surface-sunken px-space-xl pt-space-l">
            <TabsList variant="line" className="h-auto gap-space-xl p-space-none">
              <TabsTrigger
                value="servers"
                className="h-auto flex-none cursor-default rounded-none px-space-none pb-space-m">
                Servers
              </TabsTrigger>
              <TabsTrigger
                value="info"
                className="h-auto flex-none cursor-default rounded-none px-space-none pb-space-m">
                Info
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="servers" className="flex flex-col gap-space-xl bg-popover p-space-xl">
            <StatusItem state={serverState} label={serverLabel} subtitle={serverSubtitle} />
            <StatusItem state={eventBusState} label="Event Bus" subtitle={formatEventBusSubtitle(lastHeartbeat)} />
          </TabsContent>
          <TabsContent value="info" className="bg-popover p-space-xl">
            <InfoPanel />
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

type StatusItemProps = { state: StatusState; label: string; subtitle?: string };

function StatusItem({ state, label, subtitle }: StatusItemProps) {
  const isOk = state === 'ok';
  const showSubtitle = state !== 'ok';
  return (
    <div className="cursor-default">
      <Stack direction="row" align="center" justify="between">
        <Stack direction="row" align="center" gap="l">
          <StatusDot color={STATE_COLOR[state]} glow pulse={state === 'pending'} className="shrink-0" />
          <Stack gap="2xs">
            <Text as="span" variant={isOk ? 'body-strong' : 'body'} tone={isOk ? 'default' : 'muted'}>
              {label}
            </Text>
            {showSubtitle && subtitle && (
              <Text as="span" variant="micro" tone="muted">
                {subtitle}
              </Text>
            )}
          </Stack>
        </Stack>
        {isOk && <Icon as={Check} size="s" tone="muted" />}
      </Stack>
    </div>
  );
}

function InfoPanel() {
  return (
    <Stack gap="l">
      <InfoRow label="Version" value={__APP_VERSION__} />
    </Stack>
  );
}

type InfoRowProps = { label: string; value: string };

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="cursor-default">
      <Stack direction="row" align="center" justify="between">
        <Text as="span" variant="body" tone="muted">
          {label}
        </Text>
        <Text as="span" variant="body-strong">
          {value}
        </Text>
      </Stack>
    </div>
  );
}
