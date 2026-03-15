import * as React from 'react';
import { serverFetch } from '@/lib/api';
import { Copy, Check, HardDrive, AlertCircle, Loader2 } from 'lucide-react';

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

function formatPaths(paths: Paths): PathItem[] {
  return [
    { label: 'Configuration', path: paths.configDir },
    { label: 'Data', path: paths.dataDir },
    { label: 'Cache', path: paths.cacheDir },
    { label: 'Logs', path: paths.logDir },
    { label: 'Database', path: paths.filePaths.db },
    { label: 'Models', path: paths.filePaths.models },
    { label: 'Tool Output', path: paths.dirPaths.toolOutput },
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
      className={`group flex items-center justify-between py-3 px-4 sm:px-5 transition-colors hover:bg-muted/30 w-full min-w-0 overflow-hidden ${
        !isLast ? 'border-b border-border/50' : ''
      }`}
    >
      <div className="flex flex-col gap-1 flex-1 min-w-0 pr-4">
        <span className="text-sm font-medium text-foreground truncate">{item.label}</span>
        <span className="text-[13px] font-mono text-muted-foreground truncate" title={item.path}>
          {item.path}
        </span>
      </div>
      <button
        onClick={handleCopy}
        className="flex shrink-0 items-center justify-center p-2 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Copy path"
        title="Copy path"
      >
        {copied ? (
          <Check className="w-4 h-4 text-emerald-500 transition-transform scale-100" />
        ) : (
          <Copy className="w-4 h-4 transition-transform scale-100 active:scale-95" />
        )}
      </button>
    </div>
  );
}

function AdvancedContent() {
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
    fetchHealth();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 border border-border rounded-lg bg-card/50 shadow-sm">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin text-primary/70" />
          <span className="text-sm font-medium">Loading configuration paths...</span>
        </div>
      </div>
    );
  }

  if (error || !data?.paths) {
    return (
      <div className="flex items-start gap-3 p-4 bg-destructive/10 text-destructive text-sm rounded-lg border border-destructive/20 shadow-sm">
        <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1">
          <span className="font-semibold">Connection Error</span>
          <span className="opacity-90">{error || 'Unable to load paths.'}</span>
        </div>
      </div>
    );
  }

  const pathItems = formatPaths(data.paths);

  return (
    <div className="flex flex-col w-full min-w-0 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {pathItems.map((item, index) => (
        <PathRow key={item.label} item={item} isLast={index === pathItems.length - 1} />
      ))}
    </div>
  );
}

export function AdvancedSettings() {
  return (
    <div className="flex flex-col w-full min-w-0 mx-auto">
      <div className="mb-8 flex items-start gap-4 min-w-0">
        <div className="p-2.5 bg-accent/50 text-accent-foreground rounded-xl shrink-0 border border-border/50 shadow-sm">
          <HardDrive className="w-5 h-5" />
        </div>
        <div className="flex flex-col gap-1 mt-0.5">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">System Paths</h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
            View the underlying storage directories and configuration files used by the application.
          </p>
        </div>
      </div>

      <AdvancedContent />
    </div>
  );
}
