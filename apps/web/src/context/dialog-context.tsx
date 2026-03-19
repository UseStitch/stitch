import { useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';

import type { SettingsTab } from '@/routes/__root';

interface DialogContextValue {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  settingsTab: SettingsTab ;
  setSettingsTab: (tab: SettingsTab ) => void;
  renameSessionOpen: boolean;
  setRenameSessionOpen: (open: boolean) => void;
}

const DialogContext = React.createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const settingsTab = (search as { settings?: SettingsTab }).settings;

  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [renameSessionOpen, setRenameSessionOpen] = React.useState(false);

  const setSettingsTab = React.useCallback(
    (tab: SettingsTab ) => {
      void navigate({
        to: '.',
        search: (prev: Record<string, unknown>) => ({
          ...prev,
          settings: tab,
        }),
      });
    },
    [navigate],
  );

  return (
    <DialogContext.Provider
      value={{
        commandPaletteOpen,
        setCommandPaletteOpen,
        settingsTab,
        setSettingsTab,
        renameSessionOpen,
        setRenameSessionOpen,
      }}
    >
      {children}
    </DialogContext.Provider>
  );
}

export function useDialogContext(): DialogContextValue {
  const ctx = React.useContext(DialogContext);
  if (!ctx) throw new Error('useDialogContext must be used within DialogProvider');
  return ctx;
}
