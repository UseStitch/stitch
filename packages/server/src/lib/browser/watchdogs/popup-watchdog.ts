import type { CDPClient } from '@/lib/browser/cdp-client.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'browser.watchdog.popup' });

/**
 * Auto-dismisses JavaScript dialogs (alert, confirm, prompt, beforeunload)
 * so Stitch doesn't get blocked by modal popups.
 *
 * Attaches to a CDP page session and listens for Page.javascriptDialogOpening.
 * Accepts confirm/beforeunload dialogs and dismisses alert/prompt.
 */
export class PopupWatchdog {
  private sessions = new Set<CDPClient>();
  private autoDismiss = true;
  private pendingDialog: { type: string; message?: string } | null = null;

  attach(session: CDPClient): void {
    if (this.sessions.has(session)) return;
    this.sessions.add(session);
    session.on('Page.javascriptDialogOpening', this.onDialogOpening);
    log.debug('Popup watchdog attached to session');
  }

  detach(session: CDPClient): void {
    if (!this.sessions.has(session)) return;
    session.off('Page.javascriptDialogOpening', this.onDialogOpening);
    this.sessions.delete(session);
  }

  detachAll(): void {
    for (const session of this.sessions) {
      session.off('Page.javascriptDialogOpening', this.onDialogOpening);
    }
    this.sessions.clear();
    this.pendingDialog = null;
  }

  setAutoDismiss(enabled: boolean): void {
    this.autoDismiss = enabled;
  }

  hasPendingDialog(): boolean {
    return this.pendingDialog !== null;
  }

  getPendingDialog(): { type: string; message?: string } | null {
    if (!this.pendingDialog) return null;
    return { ...this.pendingDialog };
  }

  async handleDialog(options: { action: 'accept' | 'dismiss'; promptText?: string }): Promise<void> {
    if (!this.pendingDialog) {
      throw new Error('No open dialog found');
    }

    const accept = options.action === 'accept';
    const tasks: Promise<unknown>[] = [];
    for (const session of this.sessions) {
      if (!session.isConnected) continue;
      tasks.push(
        session.send('Page.handleJavaScriptDialog', {
          accept,
          promptText: options.promptText,
        }),
      );
    }

    await Promise.allSettled(tasks);
    this.pendingDialog = null;
  }

  private onDialogOpening = (params: Record<string, unknown>): void => {
    const dialogType = params.type as string;
    const message = params.message as string | undefined;

    this.pendingDialog = { type: dialogType, message };

    if (!this.autoDismiss) {
      log.info({ dialogType, message: message?.slice(0, 200) }, 'Dialog opened and waiting for explicit handling');
      return;
    }

    log.info({ dialogType, message: message?.slice(0, 200) }, 'Auto-dismissing JS dialog');

    // For confirm and beforeunload, accept (let navigation proceed).
    // For alert and prompt, dismiss.
    const accept = dialogType === 'confirm' || dialogType === 'beforeunload';

    // Fire-and-forget: we handle the dialog on whichever session sent it.
    // The event doesn't carry a session reference, so we broadcast to all.
    for (const session of this.sessions) {
      if (!session.isConnected) continue;
      session.send('Page.handleJavaScriptDialog', { accept }).catch(() => {
        // Swallow — dialog may already have been handled or session closed
      });
    }

    this.pendingDialog = null;
  };
}
