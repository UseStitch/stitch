import type { AppearanceMode } from '@stitch/shared/appearance/types';
import { APPEARANCE_MODES } from '@stitch/shared/appearance/types';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/ui/use-theme';
import { THEMES } from '@/lib/theme';
import type { ThemeTokens } from '@/lib/theme';
import { cn } from '@/lib/utils';

const MODE_LABELS: Record<AppearanceMode, string> = { light: 'Light', dark: 'Dark', system: 'System' };

export function AppearanceSettings() {
  const page = SETTINGS_PAGE_BY_ID.appearance;
  const Icon = page.icon;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <AppearanceSelector />
    </SettingPage>
  );
}

export function AppearanceSelector() {
  const { mode, themeName, setMode, setTheme } = useTheme();

  const effectiveMode =
    mode === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;

  return (
    <>
      <SettingSection title="Mode">
        <Stack direction="row" gap="m">
          {APPEARANCE_MODES.map((m) => (
            <Button
              key={m}
              type="button"
              variant="ghost"
              onClick={() => setMode(m)}
              className={cn(
                'h-auto flex-1 rounded-xl px-space-l py-space-l text-center',
                mode === m
                  ? 'border-primary bg-primary-subtle ring-2 ring-primary-subtle text-foreground shadow-sm'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-accent',
              )}>
              {MODE_LABELS[m]}
            </Button>
          ))}
        </Stack>
      </SettingSection>

      <SettingSection title="Theme">
        <div className="grid grid-cols-2 gap-space-l sm:grid-cols-4">
          {THEMES.map((t) => (
            <Button
              key={t.name}
              type="button"
              variant="ghost"
              onClick={() => setTheme(t.name)}
              className={cn(
                'h-auto flex-col items-stretch space-y-space-m rounded-xl p-space-l text-left',
                themeName === t.name
                  ? 'border-primary bg-primary-subtle ring-2 ring-primary-subtle shadow-sm'
                  : 'border-border bg-background hover:bg-accent hover:border-border-subtle',
              )}>
              <ThemePreview tokens={effectiveMode === 'dark' ? t.dark : t.light} />
              <Text as="span" variant="label">
                {t.label}
              </Text>
            </Button>
          ))}
        </div>
      </SettingSection>
    </>
  );
}

function ThemePreview({ tokens }: { tokens: ThemeTokens }) {
  return (
    <div
      className="flex h-12 gap-space-xs overflow-hidden rounded-md p-space-s"
      style={{ background: tokens['background'], border: `1px solid ${tokens['border']}` }}>
      <div className="w-5 shrink-0 rounded-sm" style={{ background: tokens['sidebar'] }} />
      <div className="flex flex-1 flex-col gap-space-xs">
        <div className="h-2 w-3/4 rounded-sm" style={{ background: tokens['muted'] }} />
        <div className="h-2 w-1/2 rounded-sm" style={{ background: tokens['primary'] }} />
      </div>
    </div>
  );
}
