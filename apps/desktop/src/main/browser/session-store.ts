import { app } from 'electron';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ElectronBrowserState } from '@stitch/shared/browser/electron';

import { DEFAULT_URL } from './url.js';

import type { PersistedBrowserState, SessionTabState, TabInfo } from './types.js';

type Persistence = { load: () => PersistedBrowserState; save: (state: PersistedBrowserState) => void };

function getStatePath(): string {
  return join(app.getPath('home'), '.stitch', 'browser-state.json');
}

function createDiskPersistence(): Persistence {
  return {
    load() {
      try {
        const raw = readFileSync(getStatePath(), 'utf8');
        return JSON.parse(raw) as PersistedBrowserState;
      } catch {
        return { sessions: {} };
      }
    },
    save(state) {
      const dir = join(app.getPath('home'), '.stitch');
      mkdirSync(dir, { recursive: true });
      writeFileSync(getStatePath(), JSON.stringify(state, null, 2), 'utf8');
    },
  };
}

export class SessionStore {
  private currentSessionId: string | null = null;
  private activeTabId: string | null = null;
  private tabs = new Map<string, TabInfo>();
  private sessionTabs = new Map<string, SessionTabState>();
  private snapshotIdentities = new Set<string>();
  private persistTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly broadcast: () => void,
    private readonly persistence: Persistence = createDiskPersistence(),
  ) {
    this.loadFromDisk();
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  getActiveTab(): TabInfo | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
  }

  getSnapshotIdentities(): string[] {
    return Array.from(this.snapshotIdentities);
  }

  setSnapshotIdentities(identities: string[]): void {
    this.snapshotIdentities = new Set(identities);
  }

  getState(
    downloads: ElectronBrowserState['downloads'],
    controller: ElectronBrowserState['controller'],
  ): ElectronBrowserState {
    return {
      tabs: Array.from(this.tabs.values()).map((tab) => ({
        ...tab,
        type: 'page',
        active: tab.id === this.activeTabId,
      })),
      activeTabId: this.activeTabId,
      visible: true,
      controller,
      downloads,
    };
  }

  switchSession(sessionId: string): boolean {
    if (sessionId === this.currentSessionId) return false;
    this.loadSessionTabs(sessionId);
    this.persistToDisk();
    return true;
  }

  loadSessionTabs(sessionId: string): void {
    this.saveCurrentSessionToMemory();
    this.currentSessionId = sessionId;
    this.snapshotIdentities.clear();
    const stored = this.sessionTabs.get(sessionId);
    this.tabs.clear();
    if (stored && stored.tabs.length > 0) {
      for (const tab of stored.tabs) {
        this.tabs.set(tab.id, tab);
      }
      this.activeTabId = stored.activeTabId;
    } else {
      this.activeTabId = null;
    }
  }

  ensureInitialTab(url: string): void {
    if (this.tabs.size > 0 && this.activeTabId) return;
    const tabId = `tab-${Date.now()}`;
    this.activeTabId = tabId;
    this.tabs.set(tabId, { id: tabId, title: '', url });
  }

  updateActiveTab(title: string, url: string): void {
    if (!this.activeTabId) return;
    this.tabs.set(this.activeTabId, { id: this.activeTabId, title, url });
    this.broadcast();
    this.debouncedPersist();
  }

  createTab(url: string): string {
    const newTabId = `tab-${Date.now()}`;
    this.tabs.set(newTabId, { id: newTabId, title: '', url });
    this.activeTabId = newTabId;
    this.broadcast();
    return newTabId;
  }

  focusTab(tabId: string): TabInfo | undefined {
    const target = this.tabs.get(tabId);
    if (!target) return undefined;
    this.activeTabId = tabId;
    this.broadcast();
    return target;
  }

  closeTab(tabId?: string): TabInfo | null | undefined {
    const targetTabId = tabId ?? this.activeTabId;
    if (!targetTabId || !this.tabs.has(targetTabId)) return undefined;
    this.tabs.delete(targetTabId);
    if (this.activeTabId !== targetTabId) {
      this.broadcast();
      this.debouncedPersist();
      return undefined;
    }

    const remaining = Array.from(this.tabs.keys());
    if (remaining.length > 0) {
      this.activeTabId = remaining[remaining.length - 1]!;
      const next = this.tabs.get(this.activeTabId)!;
      this.broadcast();
      this.debouncedPersist();
      return next;
    }

    const freshId = `tab-${Date.now()}`;
    const freshTab = { id: freshId, title: '', url: DEFAULT_URL };
    this.tabs.set(freshId, freshTab);
    this.activeTabId = freshId;
    this.broadcast();
    this.debouncedPersist();
    return freshTab;
  }

  persistToDisk(): void {
    this.saveCurrentSessionToMemory();
    const persisted: PersistedBrowserState = { sessions: {} };
    for (const [id, state] of this.sessionTabs) {
      persisted.sessions[id] = state;
    }
    this.persistence.save(persisted);
  }

  debouncedPersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistToDisk(), 2000);
  }

  private saveCurrentSessionToMemory(): void {
    if (!this.currentSessionId) return;
    this.sessionTabs.set(this.currentSessionId, {
      tabs: Array.from(this.tabs.values()),
      activeTabId: this.activeTabId,
    });
  }

  private loadFromDisk(): void {
    const persisted = this.persistence.load();
    for (const [id, state] of Object.entries(persisted.sessions)) {
      this.sessionTabs.set(id, state);
    }
  }
}
