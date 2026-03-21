import { useQueryClient } from '@tanstack/react-query';

import { useSSE } from '@/hooks/sse/sse-context';
import { settingsQueryOptions } from '@/lib/queries/settings';
import { playNotificationSound } from '@/lib/sounds';

function useNotificationSound(): void {
  const queryClient = useQueryClient();

  function isSoundEnabled(): boolean {
    const settings = queryClient.getQueryData<Record<string, string>>(
      settingsQueryOptions.queryKey,
    );
    return settings?.['notifications.sound.enabled'] !== 'false';
  }

  useSSE({
    'question-asked': () => {
      if (isSoundEnabled()) playNotificationSound();
    },
    'permission-response-requested': () => {
      if (isSoundEnabled()) playNotificationSound();
    },
  });
}

/** Render-less component that plays an attention sound when the AI needs user input. */
export function NotificationSound() {
  useNotificationSound();
  return null;
}
