import { syncAllAutomationSchedules } from '@/automations/scheduler.js';
import { internalBus } from '@/lib/internal-bus.js';

export function registerAutomationsAdapter(): void {
  internalBus.on('settings.changed', async (event) => {
    if (event.key !== 'profile.timezone') return;

    await syncAllAutomationSchedules();
  });
}
