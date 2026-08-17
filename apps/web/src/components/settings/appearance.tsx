import { CheckIcon } from 'lucide-react';

import { APPEARANCE_THEMES } from '@stitch/shared/appearance/types';
import type { AppearanceMode, AppearanceTheme } from '@stitch/shared/appearance/types';

import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/ui/use-theme';

type AppearanceOption = { mode: AppearanceMode; label: string };

const APPEARANCE_OPTIONS_BY_THEME = {
  default: [
    { mode: 'light', label: 'Light' },
    { mode: 'dark', label: 'Dark' },
  ],
  solarized: [
    { mode: 'light', label: 'Solarized Light' },
    { mode: 'dark', label: 'Solarized Dark' },
  ],
  tokyonight: [
    { mode: 'light', label: 'Tokyo Day' },
    { mode: 'dark', label: 'Tokyo Night' },
  ],
  dracula: [
    { mode: 'light', label: 'Alucard' },
    { mode: 'dark', label: 'Dracula' },
  ],
} satisfies Record<AppearanceTheme, AppearanceOption[]>;

const APPEARANCE_OPTIONS = APPEARANCE_THEMES.flatMap((theme) =>
  APPEARANCE_OPTIONS_BY_THEME[theme].map((option) => ({ theme, ...option })),
);

export function AppearanceSettings() {
  const page = SETTINGS_PAGE_BY_ID.appearance;
  const PageIcon = page.icon;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon as={PageIcon} size="l" />}>
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
          const selected = mode === option.mode && themeName === option.theme;

          return (
            <Button
              key={`${option.theme}-${option.mode}`}
              type="button"
              variant={selected ? 'selected' : 'outline'}
              size="inline"
              width="full"
              align="start"
              aria-pressed={selected}
              onClick={() => {
                setMode(option.mode);
                setTheme(option.theme);
              }}>
              <Stack width="full" gap="m" padding="m">
                <ThemePreview theme={option.theme} mode={option.mode} />
                <div className="flex w-full items-center justify-between gap-space-s">
                  <Text as="span" variant="body-strong">
                    {option.label}
                  </Text>
                  {selected && <Icon as={CheckIcon} size="m" tone="primary" />}
                </div>
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
