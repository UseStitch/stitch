import type { AppearanceMode } from '@stitch/shared/appearance/types';
import { APPEARANCE_MODES } from '@stitch/shared/appearance/types';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/ui/use-theme';
import { THEMES } from '@/lib/theme';

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
        <Stack direction="row" gap="m" width="full">
          {APPEARANCE_MODES.map((m) => (
            <Stack key={m} grow>
              <Button
                type="button"
                variant={mode === m ? 'secondary' : 'outline'}
                size="inline"
                width="full"
                onClick={() => setMode(m)}>
                <Stack width="full" align="center" padding="l">
                  <Text as="span" variant="body-strong">
                    {MODE_LABELS[m]}
                  </Text>
                </Stack>
              </Button>
            </Stack>
          ))}
        </Stack>
      </SettingSection>

      <SettingSection title="Theme">
        <div className="grid grid-cols-2 gap-space-l sm:grid-cols-4">
          {THEMES.map((t) => (
            <Button
              key={t.name}
              type="button"
              variant={themeName === t.name ? 'secondary' : 'outline'}
              size="inline"
              width="full"
              align="start"
              onClick={() => setTheme(t.name)}>
              <Stack width="full" gap="m" padding="l">
                <ThemePreview theme={t.name} mode={effectiveMode} />
                <Text as="span" variant="label">
                  {t.label}
                </Text>
              </Stack>
            </Button>
          ))}
        </div>
      </SettingSection>
    </>
  );
}

function ThemePreview({ theme, mode }: { theme: string; mode: 'light' | 'dark' }) {
  return (
    <svg
      viewBox="0 0 120 48"
      className="h-12 w-full rounded-md"
      data-slot="theme-preview"
      data-theme={theme}
      data-theme-mode={mode}
      aria-hidden="true">
      <rect x="0.5" y="0.5" width="119" height="47" rx="6" fill="var(--background)" stroke="var(--border)" />
      <rect x="7" y="7" width="22" height="34" rx="3" fill="var(--sidebar)" />
      <rect x="36" y="10" width="58" height="8" rx="3" fill="var(--muted)" />
      <rect x="36" y="25" width="39" height="8" rx="3" fill="var(--primary)" />
    </svg>
  );
}
