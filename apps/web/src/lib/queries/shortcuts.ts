import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ShortcutCategory } from '@stitch/shared/shortcuts/types';

import { serverFetch } from '@/lib/api';

export interface ShortcutEntry {
  actionId: string;
  hotkey: string | null;
  isSequence: boolean;
  label: string;
  category: ShortcutCategory;
}

const shortcutKeys = {
  all: ['shortcuts'] as const,
  list: () => [...shortcutKeys.all, 'list'] as const,
};

export const shortcutsQueryOptions = queryOptions({
  queryKey: shortcutKeys.list(),
  staleTime: Infinity,
  queryFn: async (): Promise<ShortcutEntry[]> => {
    const res = await serverFetch('/shortcuts');
    if (!res.ok) throw new Error('Failed to fetch shortcuts');
    return res.json() as Promise<ShortcutEntry[]>;
  },
});

export function useSaveShortcut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ actionId, hotkey }: { actionId: string; hotkey: string | null }) => {
      const res = await serverFetch(`/shortcuts/${actionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotkey }),
      });
      if (!res.ok) throw new Error('Failed to save shortcut');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shortcutKeys.all }),
  });
}

export function useDeleteShortcut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (actionId: string) => {
      const res = await serverFetch(`/shortcuts/${actionId}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error('Failed to delete shortcut');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shortcutKeys.all }),
  });
}

export function useResetAllShortcuts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await serverFetch('/shortcuts', { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to reset shortcuts');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shortcutKeys.all }),
  });
}
