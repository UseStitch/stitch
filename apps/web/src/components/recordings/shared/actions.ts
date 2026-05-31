import type { Recording } from '@stitch/shared/recordings/types';

const DELETE_WITHOUT_CONFIRMATION_MAX_MS = 30_000;

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function shouldConfirmRecordingDelete(recording: Pick<Recording, 'durationMs'>): boolean {
  return recording.durationMs === null || recording.durationMs > DELETE_WITHOUT_CONFIRMATION_MAX_MS;
}
