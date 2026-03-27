export type CDPRequest = {
  id: number;
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
};

export type CDPResponse = {
  id: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string; data?: string };
  sessionId?: string;
};

export type CDPEvent = {
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
};

export type CDPMessage = CDPResponse | CDPEvent;

export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  type: string;
  webSocketDebuggerUrl?: string;
};

export type BrowserVersionInfo = {
  Browser: string;
  'Protocol-Version': string;
  'User-Agent': string;
  'V8-Version': string;
  'WebKit-Version': string;
  webSocketDebuggerUrl: string;
};

export type ScreenshotResult = {
  data: string;
  format: 'png' | 'jpeg';
};

export type LaunchOptions = {
  headless?: boolean;
  port?: number;
  width?: number;
  height?: number;
};

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

/** Server-side ref entry mapping a snapshot ref (e.g. "e5") to a CDP node. */
export type RefEntry = {
  backendNodeId: number | null;
  role: string;
  name: string;
};

export type SearchPageMatch = {
  match: string;
  context: string;
  index: number;
};

export type SearchPageResult = {
  matches: SearchPageMatch[];
  total: number;
};

export type FindElementEntry = {
  tag: string;
  text?: string;
  attributes?: Record<string, string>;
};

export type FindElementsResult = {
  elements: FindElementEntry[];
  total: number;
};

export const BROWSER_ACTIONS = [
  'snapshot',
  'navigate',
  'click',
  'type',
  'press',
  'hover',
  'select',
  'scroll',
  'screenshot',
  'go_back',
  'go_forward',
  'tab_new',
  'tab_list',
  'tab_focus',
  'tab_close',
  'evaluate',
  'wait',
  'resize',
  'search_page',
  'find_elements',
] as const;
