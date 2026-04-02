import { create } from 'zustand';

import type { DesktopUpdaterState } from '@/lib/api';

type UpdaterUiState = {
  status: DesktopUpdaterState['status'] | 'installing';
  version?: string;
  progress?: number;
  error?: string;
};

type UpdaterStore = {
  updater: UpdaterUiState;
  setUpdaterState: (state: DesktopUpdaterState) => void;
  setInstalling: () => void;
};

const INITIAL_UPDATER_STATE: UpdaterUiState = {
  status: 'idle',
};

export const useUpdaterStore = create<UpdaterStore>((set) => ({
  updater: INITIAL_UPDATER_STATE,
  setUpdaterState: (state) =>
    set((current) => {
      if (current.updater.status === 'installing') return current;
      return { updater: state };
    }),
  setInstalling: () =>
    set((state) => ({
      updater: {
        ...state.updater,
        status: 'installing',
      },
    })),
}));

export function hasUpdaterBadge(status: UpdaterUiState['status']): boolean {
  return status === 'available' || status === 'downloading' || status === 'downloaded';
}
