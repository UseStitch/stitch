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
        className="relative flex items-center justify-center w-7 h-7 rounded-md hover:bg-muted/50 transition-colors"
        aria-label="Server status"
      >
        <HardDrive className="w-3.75 h-3.75 text-muted-foreground" />
        <div
          className={`absolute top-1 right-1 w-2 h-2 rounded-full border-[1.5px] border-background transition-colors ${overallHealthy ? 'bg-green-500' : 'bg-red-500'}`}
        />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        className="w-70 p-0 rounded-xl overflow-hidden shadow-lg border-border"
      >
        {/* Header Tabs */}
        <div className="flex items-center gap-5 text-[13px] px-4 pt-3 border-b border-border bg-muted/30">
          <TabButton label="Servers" active={activeTab === 'servers'} onClick={() => setActiveTab('servers')} />
          <TabButton label="Info" active={activeTab === 'info'} onClick={() => setActiveTab('info')} />
        </div>

        {/* Tab Content */}
        <div className="flex flex-col p-4 gap-4 bg-popover">
          {activeTab === 'servers' ? (
            <>
              <StatusItem active={!!isHealthy} label="Local Server" />
              <StatusItem
                active={isSseConnected}
                label="Event Bus"
                subtitle={
                  lastHeartbeat
                    ? `Last heartbeat ${formatRelativeTime(lastHeartbeat)}`
                    : undefined
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
    <div className="flex items-center justify-between cursor-default">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'}`}
        />
        <div className="flex flex-col gap-0.5">
          <span
            className={`text-[13px] ${active ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
          >
            {label}
          </span>
          {subtitle && <span className="text-[11px] text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
      {active && <Check className="w-3.5 h-3.5 text-muted-foreground" />}
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
      className={`pb-2.5 border-b-2 transition-colors cursor-default ${
        active
          ? 'border-primary text-foreground font-medium'
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
    <div className="flex items-center justify-between cursor-default">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <span className="text-[13px] text-foreground font-medium">{value}</span>
    </div>
  );
}
