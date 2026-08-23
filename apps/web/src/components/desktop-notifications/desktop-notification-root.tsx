import * as React from 'react';

import { useQuery } from '@tanstack/react-query';

import type { DesktopNotificationEvent } from '@stitch/shared/ipc/types';

import { MeetingDetectedNotification } from './meeting-detected-notification';

import { settingsQueryOptions } from '@/lib/queries/settings';
import { applyAppearanceMode, applyTheme, DEFAULT_THEME, getAppearanceMode, getTheme } from '@/lib/theme';

const EXIT_ANIMATION_MS = 220;
const NOTIFICATION_HASH_PREFIX = '#/desktop-notifications?';

function readInitialNotification(): DesktopNotificationEvent | null {
  if (!window.location.hash.startsWith(NOTIFICATION_HASH_PREFIX)) return null;

  const params = new URLSearchParams(window.location.hash.slice(NOTIFICATION_HASH_PREFIX.length));
  const value = params.get('notification');
  if (!value) return null;

  try {
    return JSON.parse(value) as DesktopNotificationEvent;
  } catch {
    return null;
  }
}

export function DesktopNotificationRoot() {
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const [notification, setNotification] = React.useState<DesktopNotificationEvent | null>(() =>
    readInitialNotification(),
  );
  const [exiting, setExiting] = React.useState(false);

  const handleDismissed = React.useEffectEvent((id: string) => {
    if (!notification || notification.id !== id) return;

    setExiting(true);
    window.setTimeout(() => setNotification(null), EXIT_ANIMATION_MS);
  });

  React.useEffect(() => {
    document.body.classList.add('desktop-notifications-window');
    return () => document.body.classList.remove('desktop-notifications-window');
  }, []);

  useDesktopNotificationTheme();

  React.useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      void window.api.notifications.setHeight(height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    return window.api.notifications.onDismissed(handleDismissed);
  }, []);

  function dismiss(id: string): void {
    void window.api.notifications.dismiss(id);

    setExiting(true);
    window.setTimeout(() => setNotification(null), EXIT_ANIMATION_MS);
  }

  return (
    <div className="min-h-screen bg-transparent p-space-none">
      <div ref={contentRef} className="w-full overflow-hidden">
        {notification?.type === 'meeting-detected' ? (
          <MeetingDetectedNotification event={notification} exiting={exiting} onDismiss={dismiss} />
        ) : null}
      </div>
    </div>
  );
}

function useDesktopNotificationTheme(): void {
  const { data: settings } = useQuery({
    ...settingsQueryOptions,
    select: (data) => ({ 'appearance.theme': data['appearance.theme'], 'appearance.mode': data['appearance.mode'] }),
  });
  const themeName = settings?.['appearance.theme'] ?? DEFAULT_THEME;
  const mode = getAppearanceMode(settings?.['appearance.mode']);

  React.useEffect(() => {
    applyTheme(getTheme(themeName));
  }, [themeName]);

  React.useEffect(() => {
    applyAppearanceMode(mode);
  }, [mode]);
}
