import { HardDrive, Check } from 'lucide-react';
import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useSSE } from '@/hooks/sse/sse-context';
import { serverFetch } from '@/lib/api';

type Tab = 'servers' | 'info';

export function ServerStatus() {
  const [activeTab, setActiveTab] = useState<Tab>('servers');

  const { data: isHealthy } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await serverFetch('/health');
      return res.ok;
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const { isConnected: isSseConnected, lastHeartbeat } = useSSE();

  const overallHealthy = isHealthy && isSseConnected;

  return (
    <Popover>
      <PopoverTrigger
        className="relative flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-muted/50"
        aria-label="Server status"
      >
        <HardDrive className="h-3.75 w-3.75 text-muted-foreground" />
        <div
          className={`absolute top-1 right-1 h-2 w-2 rounded-full border-[1.5px] border-background transition-colors ${overallHealthy ? 'bg-success' : 'bg-destructive'}`}
        />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-70 overflow-hidden rounded-xl border-border p-0 shadow-lg"
      >
        {/* Header Tabs */}
        <div className="flex items-center gap-5 border-b border-border bg-muted/30 px-4 pt-3 text-[13px]">
          <TabButton
            label="Servers"
            active={activeTab === 'servers'}
            onClick={() => setActiveTab('servers')}
          />
          <TabButton
            label="Info"
            active={activeTab === 'info'}
            onClick={() => setActiveTab('info')}
          />
        </div>

        {/* Tab Content */}
        <div className="flex flex-col gap-4 bg-popover p-4">
          {activeTab === 'servers' ? (
            <>
              <StatusItem active={!!isHealthy} label="Local Server" />
              <StatusItem
                active={isSseConnected}
                label="Event Bus"
                subtitle={
                  lastHeartbeat ? `Last heartbeat ${formatRelativeTime(lastHeartbeat)}` : undefined
                }
              />
            </>
          ) : (
            <InfoPanel />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type StatusItemProps = {
  active: boolean;
  label: string;
  subtitle?: string;
};

function StatusItem({ active, label, subtitle }: StatusItemProps) {
  return (
    <div className="flex cursor-default items-center justify-between">
      <div className="flex items-center gap-3">
        <div
          className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-success shadow-success-glow' : 'bg-destructive shadow-destructive-glow'}`}
        />
        <div className="flex flex-col gap-0.5">
          <span
            className={`text-[13px] ${active ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
          >
            {label}
          </span>
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
      {active && <Check className="h-3.5 w-3.5 text-muted-foreground" />}
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

type TabButtonProps = {
  label: string;
  active: boolean;
  onClick: () => void;
};

function TabButton({ label, active, onClick }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-default border-b-2 pb-2.5 transition-colors ${
        active
          ? 'border-primary font-medium text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </button>
  );
}

function InfoPanel() {
  return (
    <div className="flex flex-col gap-3">
      <InfoRow label="Version" value={__APP_VERSION__} />
    </div>
  );
}

type InfoRowProps = {
  label: string;
  value: string;
};

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex cursor-default items-center justify-between">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium text-foreground">{value}</span>
    </div>
  );
}
