import type { CDPClient } from '@/lib/browser/cdp-client.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'browser.watchdog.session' });

type TargetDestroyedHandler = (targetId: string) => void;
type TargetCrashedHandler = (targetId: string) => void;

/**
 * Monitors browser target lifecycle via CDP Target domain events.
 * Detects when the active tab crashes or is destroyed so the browser
 * manager can recover gracefully instead of throwing opaque errors.
 */
export class SessionHealthWatchdog {
  private client: CDPClient | null = null;
  private onTargetDestroyed: TargetDestroyedHandler | null = null;
  private onTargetCrashed: TargetCrashedHandler | null = null;

  attach(
    client: CDPClient,
    handlers: {
      onTargetDestroyed?: TargetDestroyedHandler;
      onTargetCrashed?: TargetCrashedHandler;
    },
  ): void {
    if (this.client) return;
    this.client = client;
    this.onTargetDestroyed = handlers.onTargetDestroyed ?? null;
    this.onTargetCrashed = handlers.onTargetCrashed ?? null;

    client.on('Target.targetDestroyed', this.handleTargetDestroyed);
    client.on('Target.targetCrashed', this.handleTargetCrashed);
    client.on('Inspector.targetCrashed', this.handleInspectorCrash);
    log.debug('Session health watchdog attached');
  }

  detach(): void {
    if (!this.client) return;
    this.client.off('Target.targetDestroyed', this.handleTargetDestroyed);
    this.client.off('Target.targetCrashed', this.handleTargetCrashed);
    this.client.off('Inspector.targetCrashed', this.handleInspectorCrash);
    this.client = null;
    this.onTargetDestroyed = null;
    this.onTargetCrashed = null;
  }

  private handleTargetDestroyed = (params: Record<string, unknown>): void => {
    const targetId = params.targetId as string;
    log.debug({ targetId }, 'Target destroyed');
    this.onTargetDestroyed?.(targetId);
  };

  private handleTargetCrashed = (params: Record<string, unknown>): void => {
    const targetId = params.targetId as string;
    log.warn({ targetId }, 'Target crashed');
    this.onTargetCrashed?.(targetId);
  };

  private handleInspectorCrash = (): void => {
    log.warn('Inspector reported target crash');
    // Inspector.targetCrashed doesn't include targetId, so we signal
    // crash for the active target via null — caller should treat as
    // "active target is broken".
    this.onTargetCrashed?.('');
  };
}
