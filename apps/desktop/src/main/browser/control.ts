import type { ElectronBrowserState } from '@stitch/shared/browser/electron';

const HUMAN_CONTROL_IDLE_MS = 750;

export class ControlArbiter {
  private controller: ElectronBrowserState['controller'] = 'none';
  private controlEpoch = 0;
  private humanIdleTimer: NodeJS.Timeout | null = null;

  constructor(private readonly broadcast: () => void) {}

  getController(): ElectronBrowserState['controller'] {
    return this.controller;
  }

  recordHumanInput(): void {
    this.controlEpoch++;
    this.controller = 'human';
    if (this.humanIdleTimer) clearTimeout(this.humanIdleTimer);
    this.humanIdleTimer = setTimeout(() => {
      if (this.controller === 'human') {
        this.controller = 'none';
        this.broadcast();
      }
    }, HUMAN_CONTROL_IDLE_MS);
    this.broadcast();
  }

  async withAgentControl<T>(fn: () => Promise<T>): Promise<T> {
    const epoch = this.controlEpoch;
    this.controller = 'agent';
    this.broadcast();
    const result = await fn();
    if (this.controlEpoch !== epoch)
      throw new Error('Browser control interrupted by user input. Take a fresh snapshot before continuing.');
    this.controller = 'none';
    this.broadcast();
    return result;
  }
}
