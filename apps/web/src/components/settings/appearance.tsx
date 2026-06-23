import type { AppearanceMode } from '@stitch/shared/appearance/types';
import { APPEARANCE_MODES } from '@stitch/shared/appearance/types';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
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
  const page = SETTINGS_PAGE_BY_ID.appearance;
  const Icon = page.icon;
  const { mode, themeName, setMode, setTheme } = useTheme();

  const effectiveMode =
    mode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;

  return (
    <SettingPage
      title={page.title}
      description={page.description}
      icon={<Icon className="size-5" />}
    >
      <SettingSection title="Mode">
        <div className="flex gap-2">
          {APPEARANCE_MODES.map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 rounded-xl border px-3 py-3 text-sm font-medium transition-all text-center',
                mode === m
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20 text-foreground shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent/50',
              )}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection title="Theme">
        <div className="grid grid-cols-4 gap-3">
          {THEMES.map((t) => (
            <button
              key={t.name}
              onClick={() => setTheme(t.name)}
              className={cn(
                'rounded-xl border p-3 text-left transition-all space-y-2',
                themeName === t.name
                  ? 'border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm'
                  : 'border-border bg-background hover:bg-accent/50 hover:border-foreground/20',
              )}
            >
              <ThemePreview tokens={effectiveMode === 'dark' ? t.dark : t.light} />
              <span className="text-xs font-medium">{t.label}</span>
            </button>
          ))}
        </div>
      </SettingSection>
    </SettingPage>
  );
}

function ThemePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div
      className="flex h-12 gap-1 overflow-hidden rounded-md p-1.5"
      style={{ background: tokens['background'], border: `1px solid ${tokens['border']}` }}
    >
      <div className="w-5 shrink-0 rounded-sm" style={{ background: tokens['sidebar'] }} />
      <div className="flex flex-1 flex-col gap-1">
        <div className="h-2 w-3/4 rounded-sm" style={{ background: tokens['muted'] }} />
        <div className="h-2 w-1/2 rounded-sm" style={{ background: tokens['primary'] }} />
      </div>
    </div>
  );
}
