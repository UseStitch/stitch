import type { MeetingCallDetectedPayload } from '@stitch/shared/chat/realtime';

type UserSettings = Record<string, string> | undefined;

type AppNotificationEvent = {
  kind: 'recording-suggestion';
  payload: MeetingCallDetectedPayload;
};

function isEnabled(settings: UserSettings, key: string): boolean {
  return settings?.[key] !== 'false';
}

function platformLabel(platform: MeetingCallDetectedPayload['platform']): string {
  if (platform === 'google-meet') return 'Google Meet';
  if (platform === 'teams') return 'Microsoft Teams';
  if (platform === 'zoom') return 'Zoom';
  if (platform === 'slack') return 'Slack';
  return 'Discord';
}

function toDesktopNotification(event: AppNotificationEvent): { title: string; body: string } {
  if (event.kind === 'recording-suggestion') {
    return {
      title: 'Recording suggestion',
      body: `Active call detected in ${platformLabel(event.payload.platform)}. Start recording?`,
    };
  }

  return {
    title: 'Stitch',
    body: 'You have a new notification.',
  };
}

export async function notifyAppEvent(event: AppNotificationEvent, settings: UserSettings) {
  if (!isEnabled(settings, 'notifications.os.enabled')) return;
  if (!window.api?.notifications?.show) return;

  if (event.kind === 'recording-suggestion') {
    if (!isEnabled(settings, 'notifications.os.recordingSuggestions.enabled')) return;
  }

  const notification = toDesktopNotification(event);
  const soundEnabled = isEnabled(settings, 'notifications.sound.enabled');

  try {
    await window.api.notifications.show({
      title: notification.title,
      body: notification.body,
      silent: !soundEnabled,
      clickAction:
        event.kind === 'recording-suggestion'
          ? {
              kind: 'start-recording',
              platform: event.payload.platform,
              key: event.payload.key,
            }
          : null,
    });
  } catch {
    // no-op
  }
}
