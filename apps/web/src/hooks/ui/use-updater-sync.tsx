import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import type { DesktopUpdaterState } from '@/lib/api';
import { useUpdaterStore } from '@/stores/updater-store';

const desktopUpdaterStateSchema = z.object({
  status: z.enum(['idle', 'checking', 'available', 'downloading', 'downloaded', 'no-update', 'error']),
  version: z.string().optional(),
  progress: z.number().optional(),
  error: z.string().optional(),
});

export function UpdaterSync() {
  const setUpdaterState = useUpdaterStore((state) => state.setUpdaterState);
  const setInstalling = useUpdaterStore((state) => state.setInstalling);
  const previousStatus = useRef<string>('idle');

  useEffect(() => {
    const unsub = window.electron?.subscribe('updater:event', (payload) => {
      const result = desktopUpdaterStateSchema.safeParse(payload);
      if (!result.success) return;
      const updaterState: DesktopUpdaterState = result.data;

      setUpdaterState(updaterState);
      if (updaterState.status === previousStatus.current) return;

      if (updaterState.status === 'downloaded') {
        toast.success(`Update ready${updaterState.version ? `: v${updaterState.version}` : ''}`, {
          id: 'update-ready',
          action: {
            label: 'Restart to update',
            onClick: () => {
              setInstalling();
              void window.api.updater.install();
            },
          },
        });
      }

      if (updaterState.status === 'error') {
        toast.error(updaterState.error ?? 'Failed to check for updates', { id: 'update-error' });
      }

      previousStatus.current = updaterState.status;
    });

    void window.api.updater.getState().then((state) => {
      setUpdaterState(state);
      previousStatus.current = state.status;
    });

    return () => unsub?.();
  }, [setUpdaterState, setInstalling]);

  return null;
}
