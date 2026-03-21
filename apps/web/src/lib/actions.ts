import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from '@tanstack/react-router';

import type { PrefixedString } from '@stitch/shared/id';
import type { ShortcutActionId } from '@stitch/shared/shortcuts/types';

import { useDialogContext } from '@/context/dialog-context';
import { serverFetch } from '@/lib/api';
import { agentsQueryOptions } from '@/lib/queries/agents';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';
import { useStreamStore } from '@/stores/stream-store';

export interface Action {
  id: ShortcutActionId;
  label: string;
  run: () => void;
}

export function useActions(): Action[] {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams({ strict: false });
  const sessionId = params.id;
  const agentsQuery = useQuery(agentsQueryOptions);
  const settingsQuery = useQuery(settingsQueryOptions);
  const saveDefaultAgent = useMutation(
    saveSettingMutationOptions('agent.default', queryClient, { silent: true }),
  );
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    settingsTab,
    setSettingsTab,
    renameSessionOpen,
    setRenameSessionOpen,
  } = useDialogContext();
  const abortStream = useStreamStore((s) => s.abortStream);

  const primaryAgents = (agentsQuery.data ?? []).filter((agent) => agent.type === 'primary');
  const currentAgentId = settingsQuery.data?.['agent.default'] as PrefixedString<'agt'> | undefined;

  const switchPrimaryAgent = () => {
    if (primaryAgents.length < 2) {
      return;
    }

    const currentIndex = primaryAgents.findIndex((agent) => agent.id === currentAgentId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % primaryAgents.length;
    const nextAgent = primaryAgents[nextIndex];
    if (!nextAgent) {
      return;
    }

    saveDefaultAgent.mutate(nextAgent.id);
  };

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
    { id: 'new-session', label: 'New session', run: () => void navigate({ to: '/' }) },
    {
      id: 'switch-primary-agent',
      label: 'Switch primary agent',
      run: switchPrimaryAgent,
    },
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
