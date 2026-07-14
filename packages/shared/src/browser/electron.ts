type ElectronBrowserTab = { id: string; title: string; url: string; type: 'page'; active: boolean };

export type ElectronBrowserDownload = {
  id: string;
  filename: string;
  path: string;
  url: string;
  receivedBytes: number;
  totalBytes: number;
  state: 'progressing' | 'completed' | 'cancelled' | 'interrupted';
  createdAt: number;
};

type ElectronBrowserController = 'none' | 'human' | 'agent';

export type ElectronBrowserState = {
  tabs: ElectronBrowserTab[];
  activeTabId: string | null;
  visible: boolean;
  controller: ElectronBrowserController;
  downloads: ElectronBrowserDownload[];
};

export type ElectronBrowserExecutionState = {
  url: string;
  title: string;
  readyState: string;
  focusedElement: string;
  interactiveCount: number;
  interactiveHash: string;
  bodyTextHash: string;
};

export type ElectronBrowserDialogState = {
  open: boolean;
  type?: 'alert' | 'confirm' | 'prompt' | 'beforeunload' | 'popup';
  message?: string;
  defaultPromptText?: string;
  url?: string;
  disposition?: 'pending' | 'auto-dismissed' | 'external' | 'redirected';
};

export type ElectronBrowserCommand =
  | { action: 'ensure' }
  | { action: 'state' }
  | { action: 'executionState' }
  | { action: 'snapshot' }
  | { action: 'navigate'; url: string; timeoutMs?: number }
  | { action: 'search'; query: string; engine?: string; timeoutMs?: number }
  | { action: 'goBack'; timeoutMs?: number }
  | { action: 'goForward'; timeoutMs?: number }
  | { action: 'newTab'; url?: string; timeoutMs?: number }
  | { action: 'listTabs' }
  | { action: 'focusTab'; tabId: string; timeoutMs?: number }
  | { action: 'closeTab'; tabId?: string }
  | { action: 'click'; ref: string; doubleClick?: boolean; button?: string; modifiers?: string[]; timeoutMs?: number }
  | { action: 'hover'; ref: string }
  | { action: 'type'; ref: string; text: string; slowly?: boolean; submit?: boolean; clear?: boolean }
  | { action: 'press'; key: string; timeoutMs?: number }
  | { action: 'select'; ref: string; values: string[] }
  | { action: 'getDropdownOptions'; ref: string }
  | { action: 'selectDropdown'; ref: string; text: string; timeoutMs?: number }
  | { action: 'scroll'; ref?: string; direction: 'up' | 'down' | 'left' | 'right' }
  | { action: 'screenshot'; ref?: string; format?: 'png' | 'jpeg'; quality?: number; fullPage?: boolean }
  | { action: 'evaluate'; expression: string }
  | { action: 'wait'; timeMs?: number; selector?: string; timeoutMs?: number }
  | {
      action: 'extractPageContent';
      query?: string;
      selector?: string;
      includeLinks?: boolean;
      includeImages?: boolean;
      outputSchema?: Record<string, unknown>;
    }
  | {
      action: 'searchPage';
      pattern: string;
      regex?: boolean;
      caseSensitive?: boolean;
      contextChars?: number;
      cssScope?: string;
      maxResults?: number;
    }
  | { action: 'findElements'; selector: string; attributes?: string[]; includeText?: boolean; maxResults?: number }
  | { action: 'dialogState' }
  | { action: 'handleDialog'; dialogAction: 'accept' | 'dismiss'; promptText?: string };

export type ElectronBrowserScreenshotResult = { data: string; format: 'png' | 'jpeg' };

type ElectronBrowserSearchPageMatch = { match: string; context: string; index: number };

export type ElectronBrowserSearchPageResult = { matches: ElectronBrowserSearchPageMatch[]; total: number };

type ElectronBrowserFindElementEntry = { tag: string; text?: string; attributes?: Record<string, string> };

export type ElectronBrowserFindElementsResult = { elements: ElectronBrowserFindElementEntry[]; total: number };

type ElectronBrowserDropdownOption = {
  index: number;
  text: string;
  value: string;
  selected: boolean;
  disabled: boolean;
};

export type ElectronBrowserDropdownOptionsResult = { type: string; options: ElectronBrowserDropdownOption[] };

export type ElectronBrowserExtractContentResult = {
  text: string;
  links?: Array<{ text: string; href: string }>;
  images?: Array<{ alt: string; src: string }>;
  data?: Record<string, string | string[]>;
};

/**
 * Maps each browser command action to the result the desktop side returns for it.
 * This is the single source of truth for the server-to-desktop wire contract:
 * the server's `send()` and the desktop's command handler are both bound to it,
 * so a mismatch becomes a compile error in both packages.
 */
type ElectronBrowserCommandResultMap = {
  ensure: ElectronBrowserState;
  state: ElectronBrowserState;
  executionState: ElectronBrowserExecutionState;
  snapshot: string;
  navigate: string;
  search: string;
  goBack: string;
  goForward: string;
  newTab: ElectronBrowserState;
  listTabs: ElectronBrowserTab[];
  focusTab: ElectronBrowserState;
  closeTab: ElectronBrowserState;
  click: string;
  hover: string;
  type: string;
  press: string;
  select: string;
  getDropdownOptions: ElectronBrowserDropdownOptionsResult;
  selectDropdown: string;
  scroll: string;
  screenshot: ElectronBrowserScreenshotResult;
  evaluate: unknown;
  wait: string;
  extractPageContent: string | ElectronBrowserExtractContentResult;
  searchPage: ElectronBrowserSearchPageResult;
  findElements: ElectronBrowserFindElementsResult;
  dialogState: ElectronBrowserDialogState;
  handleDialog: string;
};

export type ElectronBrowserCommandResult<A extends ElectronBrowserCommand['action']> =
  ElectronBrowserCommandResultMap[A];

/** Union of every possible command result; the return shape of the desktop command handler. */
export type ElectronBrowserCommandResultValue = ElectronBrowserCommandResultMap[keyof ElectronBrowserCommandResultMap];

type AssertExtends<A extends B, B> = A;
// Compile-time guard: the result map must cover exactly the command union's actions.
type _ResultMapCoversActions = AssertExtends<keyof ElectronBrowserCommandResultMap, ElectronBrowserCommand['action']>;
type _ActionsCoveredByResultMap = AssertExtends<
  ElectronBrowserCommand['action'],
  keyof ElectronBrowserCommandResultMap
>;

export type ElectronBrowserCommandMessage = {
  id: string;
  type: 'browser:command';
  sessionId: string;
  command: ElectronBrowserCommand;
};

export type ElectronBrowserResultMessage = { id: string; type: 'browser:result'; ok: true; result: unknown };

export type ElectronBrowserErrorMessage = { id: string; type: 'browser:result'; ok: false; error: string };
