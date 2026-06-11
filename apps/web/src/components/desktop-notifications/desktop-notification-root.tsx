import * as React from 'react';

import type { DesktopNotificationEvent } from '@stitch/shared/ipc/types';

import { MeetingDetectedNotification } from './meeting-detected-notification';

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

  React.useEffect(() => {
    document.body.classList.add('desktop-notifications-window');
    return () => document.body.classList.remove('desktop-notifications-window');
  }, []);

  React.useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height ?? 0;
      void window.api?.notifications?.setHeight(height);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    return window.api?.notifications?.onDismissed((id) => {
      setNotification((current) => {
        if (!current || current.id !== id) return current;

        setExiting(true);
        window.setTimeout(() => setNotification(null), EXIT_ANIMATION_MS);
        return current;
      });
    });
  }, []);

  function dismiss(id: string): void {
    if (window.api?.notifications?.dismiss) {
      void window.api.notifications.dismiss(id);
      return;
    }

    setExiting(true);
    window.setTimeout(() => setNotification(null), EXIT_ANIMATION_MS);
  }

  return (
    <div className="min-h-screen bg-transparent p-0">
      <div ref={contentRef} className="w-full overflow-hidden">
        {notification?.type === 'meeting-detected' ? (
          <MeetingDetectedNotification event={notification} exiting={exiting} onDismiss={dismiss} />
        ) : null}
      </div>
    </div>
  );
}
