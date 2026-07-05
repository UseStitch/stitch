import type {
  ElectronBrowserDropdownOptionsResult,
  ElectronBrowserExtractContentResult,
  ElectronBrowserFindElementsResult,
  ElectronBrowserScreenshotResult,
  ElectronBrowserSearchPageResult,
} from '@stitch/shared/browser/electron';

export type BrowserTab = { id: string; title: string; url: string; type: string };

export type LaunchOptions = { port?: number; width?: number; height?: number };

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

// Wire-result shapes are defined once in @stitch/shared/browser/electron (the
// server-to-desktop contract). These aliases keep the server's existing names.
export type ScreenshotResult = ElectronBrowserScreenshotResult;
export type SearchPageResult = ElectronBrowserSearchPageResult;
export type FindElementsResult = ElectronBrowserFindElementsResult;
export type DropdownOptionsResult = ElectronBrowserDropdownOptionsResult;
export type ExtractContentResult = ElectronBrowserExtractContentResult;
