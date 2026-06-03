import type { Recording, RecordingPlatform } from '@stitch/shared/recordings/types';

export const PLATFORM_CONFIG: Record<RecordingPlatform, { label: string; slug: string | null }> = {
  manual: { label: 'Manual', slug: null },
  zoom: { label: 'Zoom', slug: 'zoom' },
  teams: { label: 'Teams', slug: 'microsoftteams' },
  slack: { label: 'Slack', slug: 'slack' },
  discord: { label: 'Discord', slug: 'discord' },
  'google-meet': { label: 'Google Meet', slug: 'googlemeet' },
};

export function getRecordingDisplayTitle(recording: Recording): string {
  return recording.analysisTitle || recording.title;
}

export function formatRecordingDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatRecordingShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function formatRecordingTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatClockDuration(durationMs: number | null): string {
  if (durationMs === null) return '--';

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatReadableDuration(durationMs: number | null): string {
  if (durationMs === null) return '--';

  const totalSeconds = Math.floor(durationMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  }

  if (minutes > 0) {
    return `${minutes} mins`;
  }

  return `${seconds} secs`;
}
