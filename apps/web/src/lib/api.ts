import type {
  MeetingCallDetectedPayload,
  MeetingCallEndedPayload,
  RecordingDeviceChangedPayload,
  RecordingWarningPayload,
} from '@stitch/shared/chat/realtime';
import type {
  StartRecordingInput,
  StartRecordingResponse,
  StopRecordingResponse,
} from '@stitch/shared/recordings/types';

export type ContextMenuParams = {
  x: number;
  y: number;
  misspelledWord: string;
  dictionarySuggestions: string[];
  selectionText: string;
  isEditable: boolean;
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
};

export type DesktopUpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'no-update'
  | 'error';

export type DesktopUpdaterState = {
  status: DesktopUpdaterStatus;
  version?: string;
  progress?: number;
  error?: string;
};

export type ServerMode = 'local' | 'remote';

export type ServerConnectionConfig = {
  url: string;
  mode: ServerMode;
  remoteUrl: string | null;
};

declare global {
  interface Window {
    electron?: {
      platform: NodeJS.Platform;
      send: (channel: string, data?: unknown) => void;
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
    };
    api?: {
      getServerConfig: () => Promise<ServerConnectionConfig>;
      server?: {
        testRemote: (url: string) => Promise<{ ok: boolean; url?: string; error?: string }>;
        setConfig: (config: {
          mode: ServerMode;
          remoteUrl: string | null;
        }) => Promise<ServerConnectionConfig>;
        onConfigChanged: (callback: (config: ServerConnectionConfig) => void) => () => void;
      };
      window?: {
        minimize: () => Promise<void>;
        maximize: () => Promise<void>;
        close: () => Promise<void>;
        isMaximized: () => Promise<boolean>;
        isFullScreen: () => Promise<boolean>;
      };
      devtools?: {
        toggle: () => Promise<void>;
        inspect: (x: number, y: number) => Promise<void>;
      };
      shell?: {
        openExternal: (url: string) => Promise<void>;
      };
      files?: {
        writeTmp: (data: ArrayBuffer, ext: string) => Promise<string>;
        openPath: () => Promise<string[]>;
      };
      updater?: {
        check: () => Promise<DesktopUpdaterState>;
        getState: () => Promise<DesktopUpdaterState>;
        install: () => Promise<boolean>;
      };
      spellcheck?: {
        replaceMisspelling: (word: string) => Promise<void>;
        addToDictionary: (word: string) => Promise<void>;
      };
      permissions?: {
        requestMicrophone: () => Promise<boolean>;
        getScreenCaptureStatus: () => Promise<string>;
        openScreenCaptureSettings: () => Promise<void>;
      };
      meeting?: {
        onCallDetected: (callback: (payload: MeetingCallDetectedPayload) => void) => () => void;
        onCallEnded: (callback: (payload: MeetingCallEndedPayload) => void) => () => void;
      };
      recording?: {
        start: (input: StartRecordingInput) => Promise<StartRecordingResponse>;
        stop: () => Promise<StopRecordingResponse>;
        listDevices: () => Promise<{
          microphoneDevices: string[];
          speakerDevices: string[];
        }>;
        checkPermissions: () => Promise<{
          microphone: 'granted' | 'denied' | 'unknown';
          screenCapture: 'granted' | 'denied' | 'unknown';
        }>;
        onWarning: (callback: (payload: RecordingWarningPayload) => void) => () => void;
        onDeviceChanged: (callback: (payload: RecordingDeviceChangedPayload) => void) => () => void;
      };
    };
  }
}

const DEV_FALLBACK_URL = 'http://localhost:3000';

let cachedUrl: string | null = null;

export function getServerUrlSync(): string | null {
  return cachedUrl;
}

export function resetServerUrlCache(url?: string): void {
  cachedUrl = url ?? null;
}

export async function getServerUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl;

  if (window.api?.getServerConfig) {
    const config = await window.api.getServerConfig();
    cachedUrl = config.url;
    return cachedUrl;
  }

  cachedUrl = DEV_FALLBACK_URL;
  return cachedUrl;
}

export async function serverFetch(path: string, init?: RequestInit): Promise<Response> {
  const baseUrl = await getServerUrl();
  return fetch(`${baseUrl}${path}`, init);
}
