import { useEffect, useRef } from 'react';

import { toast } from 'sonner';

import type { DesktopUpdaterState } from '@/lib/api';
import { useUpdaterStore } from '@/stores/updater-store';

const VALID_UPDATER_STATUSES = new Set([
  'idle',
  'checking',
  'available',
  'downloading',
  'downloaded',
  'no-update',
  'error',
]);

function isDesktopUpdaterState(value: unknown): value is DesktopUpdaterState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Record<string, unknown>;
  return typeof state['status'] === 'string' && VALID_UPDATER_STATUSES.has(state['status']);
}

export function UpdaterSync() {
  const setUpdaterState = useUpdaterStore((state) => state.setUpdaterState);
  const previousStatus = useRef<string>('idle');

  useEffect(() => {
    const unsub = window.electron?.on('updater:event', (payload) => {
      if (!isDesktopUpdaterState(payload)) return;

      setUpdaterState(payload);
      if (payload.status === previousStatus.current) return;

      if (payload.status === 'available') {
        toast.info(`Update available${payload.version ? `: v${payload.version}` : ''}`);
      }

      if (payload.status === 'downloaded') {
        toast.success('Update ready. Open Settings > General to restart and install.');
      }

      if (payload.status === 'error') {
        toast.error(payload.error ?? 'Failed to check for updates');
      }

      previousStatus.current = payload.status;
    });

    void window.api?.updater?.getState?.().then((state) => {
      if (!isDesktopUpdaterState(state)) return;
      setUpdaterState(state);
      previousStatus.current = state.status;
    });

    return () => unsub?.();
  }, [setUpdaterState]);

  return null;
}
