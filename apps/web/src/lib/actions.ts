import { useMatchRoute, useNavigate } from '@tanstack/react-router';

import type { ShortcutActionId } from '@stitch/shared/shortcuts/types';

import { useDialogContext } from '@/context/dialog-context';
import { serverFetch } from '@/lib/api';
import { useStreamStore } from '@/stores/stream-store';

export interface Action {
  id: ShortcutActionId;
  label: string;
  run: () => void;
}

export function useActions(): Action[] {
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const sessionMatch = matchRoute({ to: '/session/$id' });
  const sessionId = sessionMatch ? sessionMatch.id : undefined;
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    settingsTab,
    setSettingsTab,
    renameSessionOpen,
    setRenameSessionOpen,
  } = useDialogContext();
  const abortStream = useStreamStore((s) => s.abortStream);

  const actions: Action[] = [
    {
      id: 'command-palette',
      label: 'Command palette',
      run: () => setCommandPaletteOpen(!commandPaletteOpen),
    },
    {
      id: 'open-settings',
      label: 'Open settings',
      run: () => setSettingsTab(settingsTab ? undefined : 'general'),
    },
    { id: 'open-chat', label: 'Chat', run: () => void navigate({ to: '/' }) },
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
    actions.push({
      id: 'stop-stream',
      label: 'Stop stream',
      run: () => void abortStream(sessionId),
    });
  }

  return actions;
}
