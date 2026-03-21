import notificationSrc from '@/assets/audio/bip-bop-01.aac?url';

export function playNotificationSound(): void {
  if (typeof Audio === 'undefined') return;
  const audio = new Audio(notificationSrc);
  audio.play().catch(() => undefined);
}
