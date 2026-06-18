export type ElectronBrowserTab = {
  id: string;
  title: string;
  url: string;
  type: 'page';
  active: boolean;
};

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

export type ElectronBrowserController = 'none' | 'human' | 'agent';

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
  | {
      action: 'click';
      ref: string;
      doubleClick?: boolean;
      button?: string;
      modifiers?: string[];
      timeoutMs?: number;
    }
  | { action: 'hover'; ref: string }
  | {
      action: 'type';
      ref: string;
      text: string;
      slowly?: boolean;
      submit?: boolean;
      clear?: boolean;
    }
  | { action: 'press'; key: string; timeoutMs?: number }
  | { action: 'select'; ref: string; values: string[] }
  | { action: 'getDropdownOptions'; ref: string }
  | { action: 'selectDropdown'; ref: string; text: string; timeoutMs?: number }
  | { action: 'scroll'; ref?: string; direction: 'up' | 'down' | 'left' | 'right' }
  | { action: 'resize'; width: number; height: number }
  | {
      action: 'screenshot';
      ref?: string;
      format?: 'png' | 'jpeg' | 'webp';
      quality?: number;
      fullPage?: boolean;
    }
  | { action: 'evaluate'; expression: string }
  | { action: 'wait'; timeMs?: number; selector?: string; timeoutMs?: number }
  | {
      action: 'extractPageContent';
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
  | {
      action: 'findElements';
      selector: string;
      attributes?: string[];
      includeText?: boolean;
      maxResults?: number;
    }
  | { action: 'dialogState' }
  | { action: 'handleDialog'; dialogAction: 'accept' | 'dismiss'; promptText?: string };

export type ElectronBrowserCommandMessage = {
  id: string;
  type: 'browser:command';
  sessionId: string;
  command: ElectronBrowserCommand;
};

export type ElectronBrowserResultMessage = {
  id: string;
  type: 'browser:result';
  ok: true;
  result: unknown;
};

export type ElectronBrowserErrorMessage = {
  id: string;
  type: 'browser:result';
  ok: false;
  error: string;
};
