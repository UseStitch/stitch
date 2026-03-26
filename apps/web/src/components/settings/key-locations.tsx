import { Copy, Check, AlertCircle, Loader2 } from 'lucide-react';
import * as React from 'react';

import { serverFetch } from '@/lib/api';

interface Paths {
  configDir: string;
  dataDir: string;
  cacheDir: string;
  logDir: string;
  filePaths: {
    db: string;
    models: string;
  };
  dirPaths: {
    toolOutput: string;
    recordings: string;
  };
}

interface HealthResponse {
  status: string;
  paths: Paths;
}

interface PathItem {
  label: string;
  path: string;
}

interface PathGroup {
  title: string;
  items: PathItem[];
}

function formatPaths(paths: Paths): PathGroup[] {
  return [
    {
      title: 'System Directories',
      items: [
        { label: 'Configuration', path: paths.configDir },
        { label: 'Data', path: paths.dataDir },
        { label: 'Cache', path: paths.cacheDir },
        { label: 'Logs', path: paths.logDir },
      ],
    },
    {
      title: 'Application Files',
      items: [
        { label: 'Database', path: paths.filePaths.db },
        { label: 'Models', path: paths.filePaths.models },
      ],
    },
    {
      title: 'Output & Media',
      items: [
        { label: 'Tool Output', path: paths.dirPaths.toolOutput },
        { label: 'Recordings', path: paths.dirPaths.recordings },
      ],
    },
  ];
}

function PathRow({ item, isLast }: { item: PathItem; isLast: boolean }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(item.path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  return (
    <div
      className={`group flex w-full min-w-0 items-center justify-between overflow-hidden px-4 py-3 transition-colors hover:bg-muted/50 ${
        !isLast ? 'border-b border-border/50' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pr-4">
        <span className="text-sm font-medium text-foreground">{item.label}</span>
        <span className="truncate font-mono text-xs text-muted-foreground" title={item.path}>
          {item.path}
        </span>
      </div>
      <button
        onClick={handleCopy}
        className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-muted-foreground transition-all hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Copy path"
        title="Copy path"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
      </button>
    </div>
  );
}

function KeyLocationsContent() {
  const [data, setData] = React.useState<HealthResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await serverFetch('/health');
        if (!res.ok) throw new Error('Failed to fetch');
        const json = (await res.json()) as HealthResponse;
        setData(json);
      } catch {
        setError('Unable to load storage paths. Please ensure the server is running.');
      } finally {
        setLoading(false);
      }
    }
    void fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading paths...</span>
      </div>
    );
  }

  if (error || !data?.paths) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">Connection Error</span>
          <span className="text-xs opacity-90">{error || 'Unable to load paths.'}</span>
        </div>
      </div>
    );
  }

  const pathGroups = formatPaths(data.paths);

  return (
    <div className="flex w-full min-w-0 flex-col gap-6">
      {pathGroups.map((group) => (
        <div key={group.title} className="flex flex-col gap-3">
          <h3 className="px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.title}
          </h3>
          <div className="overflow-hidden rounded-xl border border-border/50 bg-card/50 shadow-sm">
            {group.items.map((item, index) => (
              <PathRow key={item.label} item={item} isLast={index === group.items.length - 1} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KeyLocationsSettings() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-base font-bold">Key Locations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Storage directories and configuration files used by the application
        </p>
      </div>
      <KeyLocationsContent />
    </div>
  );
}
