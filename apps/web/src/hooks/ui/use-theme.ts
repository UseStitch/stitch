import * as React from 'react';

import { useSuspenseQuery, useQueryClient, useMutation } from '@tanstack/react-query';

import type { AppearanceMode } from '@stitch/shared/appearance/types';

import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings';
import { getTheme, getAppearanceMode, applyTheme, applyAppearanceMode, DEFAULT_THEME } from '@/lib/theme';

export function useTheme() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery({
    ...settingsQueryOptions,
    select: (data) => ({ 'appearance.mode': data['appearance.mode'], 'appearance.theme': data['appearance.theme'] }),
  });

  const mode = getAppearanceMode(settings['appearance.mode']);
  const themeName = settings['appearance.theme'] ?? DEFAULT_THEME;

  React.useEffect(() => {
    applyTheme(getTheme(themeName));
  }, [themeName]);

  React.useEffect(() => {
    applyAppearanceMode(mode);
  }, [mode]);

  const saveModeMutation = useMutation(saveSettingMutationOptions('appearance.mode', queryClient, { silent: true }));
  const saveThemeMutation = useMutation(saveSettingMutationOptions('appearance.theme', queryClient, { silent: true }));

  return {
    mode,
    themeName,
    setMode: (value: AppearanceMode) => saveModeMutation.mutate(value),
    setTheme: (value: string) => saveThemeMutation.mutate(value),
  };
}
