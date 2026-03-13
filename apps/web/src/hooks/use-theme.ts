import * as React from 'react'
import { useSuspenseQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import type { AppearanceMode } from '@openwork/shared'
import { settingsQueryOptions, saveSettingMutationOptions } from '@/lib/queries/settings'
import {
  getTheme,
  injectThemeCss,
  applyAppearanceMode,
  DEFAULT_THEME,
  DEFAULT_MODE,
} from '@/lib/theme'

export function useTheme() {
  const queryClient = useQueryClient()
  const { data: settings } = useSuspenseQuery(settingsQueryOptions)

  const mode = (settings['appearance.mode'] as AppearanceMode | undefined) ?? DEFAULT_MODE
  const themeName = settings['appearance.theme'] ?? DEFAULT_THEME

  React.useEffect(() => {
    injectThemeCss(getTheme(themeName))
  }, [themeName])

  React.useEffect(() => {
    applyAppearanceMode(mode)

    if (mode !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyAppearanceMode('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const saveModeMutation = useMutation(saveSettingMutationOptions('appearance.mode', queryClient, { silent: true }))
  const saveThemeMutation = useMutation(saveSettingMutationOptions('appearance.theme', queryClient, { silent: true }))

  return {
    mode,
    themeName,
    setMode: (value: AppearanceMode) => saveModeMutation.mutate(value),
    setTheme: (value: string) => saveThemeMutation.mutate(value),
  }
}
