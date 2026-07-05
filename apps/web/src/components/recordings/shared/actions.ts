import type { Recording } from '@stitch/shared/recordings/types';

const DELETE_WITHOUT_CONFIRMATION_MAX_MS = 30_000;

export function shouldConfirmRecordingDelete(recording: Pick<Recording, 'durationMs'>): boolean {
  return recording.durationMs === null || recording.durationMs > DELETE_WITHOUT_CONFIRMATION_MAX_MS;
}
