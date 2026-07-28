import { HardDrive, Check } from 'lucide-react';
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
    void window.api?.getServerConfig().then(setConfig);
    return window.api?.server?.onConfigChanged(setConfig);
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
        className="relative flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted/50"
        aria-label="Server status">
        <HardDrive className="h-3.75 w-3.75 text-muted-foreground" />
        <StatusDot
          color={STATE_COLOR[overallState]}
          className="absolute top-1 right-1 border-2 border-background transition-colors"
        />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-70 overflow-hidden rounded-xl border-border p-0 shadow-lg">
        <Tabs defaultValue="servers" className="gap-0">
          <div className="bg-muted/30 px-4 pt-3">
            <TabsList variant="line" className="h-auto gap-5 p-0">
              <TabsTrigger value="servers" className="h-auto flex-none cursor-default rounded-none px-0 pb-2.5">
                Servers
              </TabsTrigger>
              <TabsTrigger value="info" className="h-auto flex-none cursor-default rounded-none px-0 pb-2.5">
                Info
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="servers" className="flex flex-col gap-4 bg-popover p-4">
            <StatusItem state={serverState} label={serverLabel} subtitle={serverSubtitle} />
            <StatusItem
              state={eventBusState}
              label="Event Bus"
              subtitle={formatEventBusSubtitle(sseStatus, lastHeartbeat)}
            />
          </TabsContent>
          <TabsContent value="info" className="bg-popover p-4">
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
  return (
    <div className="flex cursor-default items-center justify-between">
      <div className="flex items-center gap-3">
        <StatusDot color={STATE_COLOR[state]} glow pulse={state === 'pending'} className="shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className={`text-sm ${isOk ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{label}</span>
          {subtitle && <span className="text-2xs text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
      {isOk && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
    </div>
  );
}

function InfoPanel() {
  return (
    <div className="flex flex-col gap-3">
      <InfoRow label="Version" value={__APP_VERSION__} />
    </div>
  );
}

type InfoRowProps = { label: string; value: string };

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex cursor-default items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}
