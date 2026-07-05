import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import type { ShortcutCategory } from '@stitch/shared/shortcuts/types';

import { serverRequest } from '@/lib/api';

export interface ShortcutEntry {
  actionId: string;
  hotkey: string | null;
  isSequence: boolean;
  label: string;
  category: ShortcutCategory;
}

const shortcutKeys = { all: ['shortcuts'] as const, list: () => [...shortcutKeys.all, 'list'] as const };

export const shortcutsQueryOptions = queryOptions({
  queryKey: shortcutKeys.list(),
  queryFn: () => serverRequest<ShortcutEntry[]>('/shortcuts'),
});

export function useSaveShortcut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, hotkey }: { actionId: string; hotkey: string | null }) =>
      serverRequest<void>(`/shortcuts/${actionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hotkey }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shortcutKeys.all }),
  });
}

export function useDeleteShortcut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (actionId: string) =>
      serverRequest<void>(`/shortcuts/${actionId}`, { method: 'DELETE' }).catch((err) => {
        if (err instanceof Error && err.message.includes('status 404')) return;
        throw err;
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shortcutKeys.all }),
  });
}

export function useResetAllShortcuts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => serverRequest<void>('/shortcuts', { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: shortcutKeys.all }),
  });
}
