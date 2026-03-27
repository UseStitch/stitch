import type { CDPClient } from '@/lib/browser/cdp-client.js';
import * as Log from '@/lib/log.js';

const log = Log.create({ service: 'browser.watchdog.popup' });

/**
 * Auto-dismisses JavaScript dialogs (alert, confirm, prompt, beforeunload)
 * so the browser agent doesn't get blocked by modal popups.
 *
 * Attaches to a CDP page session and listens for Page.javascriptDialogOpening.
 * Accepts confirm/beforeunload dialogs and dismisses alert/prompt.
 */
export class PopupWatchdog {
  private sessions = new Set<CDPClient>();

  attach(session: CDPClient): void {
    if (this.sessions.has(session)) return;
    this.sessions.add(session);
    session.on('Page.javascriptDialogOpening', this.handleDialog);
    log.debug('Popup watchdog attached to session');
  }

  detach(session: CDPClient): void {
    if (!this.sessions.has(session)) return;
    session.off('Page.javascriptDialogOpening', this.handleDialog);
    this.sessions.delete(session);
  }

  detachAll(): void {
    for (const session of this.sessions) {
      session.off('Page.javascriptDialogOpening', this.handleDialog);
    }
    this.sessions.clear();
  }

  private handleDialog = (params: Record<string, unknown>): void => {
    const dialogType = params.type as string;
    const message = params.message as string | undefined;

    log.info({ dialogType, message: message?.slice(0, 200) }, 'Auto-dismissing JS dialog');

    // For confirm and beforeunload, accept (let navigation proceed).
    // For alert and prompt, dismiss.
    const accept = dialogType === 'confirm' || dialogType === 'beforeunload';

    // Fire-and-forget: we handle the dialog on whichever session sent it.
    // The event doesn't carry a session reference, so we broadcast to all.
    for (const session of this.sessions) {
      if (!session.isConnected) continue;
      session
        .send('Page.handleJavaScriptDialog', { accept })
        .catch(() => {
          // Swallow — dialog may already have been handled or session closed
        });
    }
  };
}
