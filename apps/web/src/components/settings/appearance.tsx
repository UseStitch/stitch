import type { AppearanceMode } from '@stitch/shared/appearance/types';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/ui/use-theme';

const APPEARANCE_OPTIONS: { theme: string; mode: AppearanceMode; label: string }[] = [
  { theme: 'default', mode: 'system', label: 'Default System' },
  { theme: 'default', mode: 'light', label: 'Default Light' },
  { theme: 'default', mode: 'dark', label: 'Default Dark' },
  { theme: 'solarized', mode: 'light', label: 'Solarized Light' },
  { theme: 'tokyonight', mode: 'dark', label: 'Tokyo Night' },
  { theme: 'dracula', mode: 'dark', label: 'Dracula' },
];

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

  return (
    <SettingSection title="Appearance">
      <div className="grid grid-cols-1 gap-space-m sm:grid-cols-2 lg:grid-cols-3">
        {APPEARANCE_OPTIONS.map((option) => {
          const previewMode =
            option.mode === 'system'
              ? window.matchMedia('(prefers-color-scheme: dark)').matches
                ? 'dark'
                : 'light'
              : option.mode;
          const selected = mode === option.mode && themeName === option.theme;

          return (
            <Button
              key={`${option.theme}-${option.mode}`}
              type="button"
              variant={selected ? 'secondary' : 'outline'}
              size="inline"
              width="full"
              align="start"
              onClick={() => {
                setMode(option.mode);
                setTheme(option.theme);
              }}>
              <Stack width="full" gap="m" padding="m">
                <ThemePreview theme={option.theme} mode={previewMode} />
                <Text as="span" variant="body-strong">
                  {option.label}
                </Text>
              </Stack>
            </Button>
          );
        })}
      </div>
    </SettingSection>
  );
}

function ThemePreview({ theme, mode }: { theme: string; mode: 'light' | 'dark' }) {
  return (
    <div
      className="flex h-20 w-full overflow-hidden rounded-md border border-border bg-background"
      data-slot="theme-preview"
      data-theme={theme}
      data-theme-mode={mode}
      aria-hidden="true">
      <div className="w-10 shrink-0 border-r border-sidebar-border bg-sidebar p-space-s">
        <div className="mb-space-l flex items-center gap-space-xs">
          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
          <div className="h-1 w-4 rounded-full bg-sidebar-foreground opacity-60" />
        </div>
        <div className="mb-space-s h-1.5 w-full rounded-full bg-sidebar-accent" />
        <div className="h-1.5 w-3/4 rounded-full bg-sidebar-accent" />
      </div>
      <div className="min-w-0 flex-1 p-space-s">
        <div className="mb-space-s flex items-center justify-between">
          <div className="h-1.5 w-16 rounded-full bg-foreground opacity-70" />
          <div className="h-2.5 w-2.5 rounded-full bg-muted" />
        </div>
        <div className="rounded-sm border border-border bg-card p-space-s">
          <div className="mb-space-s h-1.5 w-1/3 rounded-full bg-card-foreground opacity-70" />
          <div className="mb-space-xs h-1 w-4/5 rounded-full bg-muted" />
          <div className="mb-space-s h-1 w-2/3 rounded-full bg-muted" />
          <div className="h-1.5 w-8 rounded-full bg-primary" />
        </div>
      </div>
    </div>
  );
}
