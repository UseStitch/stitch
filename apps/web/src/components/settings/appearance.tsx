import type { AppearanceMode } from '@openwork/shared';
import { APPEARANCE_MODES } from '@openwork/shared';

import { useTheme } from '@/hooks/ui/use-theme';
import { THEMES } from '@/lib/theme';
import type { ThemeTokens } from '@/lib/theme';
import { cn } from '@/lib/utils';

const MODE_LABELS: Record<AppearanceMode, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function AppearanceSettings() {
  const { mode, themeName, setMode, setTheme } = useTheme();

  const effectiveMode =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-bold">Appearance</h2>
        <p className="text-sm text-muted-foreground mt-1">Customize how Openwork looks</p>
      </div>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Mode</h3>
        <div className="flex gap-2">
          {APPEARANCE_MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                mode === m
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Theme</h3>
        <div className="grid grid-cols-4 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t.name)}
              className={cn(
                'rounded-xl border p-3 text-left transition-all space-y-2',
                themeName === t.name
                  ? 'border-primary ring-2 ring-primary/30 shadow-sm'
                  : 'border-border hover:border-foreground/30',
              )}
            >
              <ThemePreview tokens={effectiveMode === 'dark' ? t.dark : t.light} />
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ThemePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div
      className="h-12 rounded-md overflow-hidden flex gap-1 p-1.5"
      style={{ background: tokens['background'], border: `1px solid ${tokens['border']}` }}
    >
      <div className="w-5 rounded-sm shrink-0" style={{ background: tokens['sidebar'] }} />
      <div className="flex-1 flex flex-col gap-1">
        <div className="h-2 w-3/4 rounded-sm" style={{ background: tokens['muted'] }} />
        <div className="h-2 w-1/2 rounded-sm" style={{ background: tokens['primary'] }} />
      </div>
    </div>
  );
}
