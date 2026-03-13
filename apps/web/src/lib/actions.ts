import { useNavigate } from '@tanstack/react-router'
import type { ShortcutActionId } from '@openwork/shared'
import { useDialogContext } from '@/context/dialog-context'

export interface Action {
  id: ShortcutActionId
  label: string
  run: () => void
}

export function useActions(): Action[] {
  const navigate = useNavigate()
  const { commandPaletteOpen, setCommandPaletteOpen, settingsOpen, setSettingsOpen } = useDialogContext()

  return [
    { id: 'command-palette', label: 'Command palette', run: () => setCommandPaletteOpen(!commandPaletteOpen) },
    { id: 'open-settings', label: 'Open settings', run: () => setSettingsOpen(!settingsOpen) },
    { id: 'new-session', label: 'New session', run: () => void navigate({ to: '/' }) },
  ]
}
