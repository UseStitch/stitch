import { useNavigate, useParams } from '@tanstack/react-router';

import type { ShortcutActionId } from '@openwork/shared';

import { useDialogContext } from '@/context/dialog-context';
import { serverFetch } from '@/lib/api';

export interface Action {
  id: ShortcutActionId;
  label: string;
  run: () => void;
}

export function useActions(): Action[] {
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const sessionId = params.id as string | undefined;
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    settingsOpen,
    setSettingsOpen,
    renameSessionOpen,
    setRenameSessionOpen,
  } = useDialogContext();

  const actions: Action[] = [
    {
      id: 'command-palette',
      label: 'Command palette',
      run: () => setCommandPaletteOpen(!commandPaletteOpen),
    },
    { id: 'open-settings', label: 'Open settings', run: () => setSettingsOpen(!settingsOpen) },
    { id: 'new-session', label: 'New session', run: () => void navigate({ to: '/' }) },
    {
      id: 'rename-session',
      label: 'Rename session',
      run: () => setRenameSessionOpen(!renameSessionOpen),
    },
  ];

  if (sessionId) {
    actions.push({
      id: 'compact-session',
      label: 'Compact session',
      run: () => {
        void serverFetch(`/chat/sessions/${sessionId}/compact`, { method: 'POST' });
      },
    });
  }

  return actions;
}
