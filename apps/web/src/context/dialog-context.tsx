import * as React from 'react'

interface DialogContextValue {
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (open: boolean) => void
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  return (
    <DialogContext.Provider value={{ commandPaletteOpen, setCommandPaletteOpen, settingsOpen, setSettingsOpen }}>
      {children}
    </DialogContext.Provider>
  )
}

export function useDialogContext(): DialogContextValue {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error('useDialogContext must be used within DialogProvider')
  return ctx
}
