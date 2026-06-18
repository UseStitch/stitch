export type RefEntry = {
  selector: string;
  tag: string;
  role: string;
  name: string;
  identity: string;
  inViewport: boolean;
  x: number;
  y: number;
};

export type TabInfo = { id: string; title: string; url: string };
export type SessionTabState = { tabs: TabInfo[]; activeTabId: string | null };
export type PersistedBrowserState = { sessions: Record<string, SessionTabState> };
