export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  type: string;
};

export type ScreenshotResult = {
  data: string;
  format: 'png' | 'jpeg' | 'webp';
};

export type LaunchOptions = {
  port?: number;
  width?: number;
  height?: number;
};

export type ScrollDirection = 'up' | 'down' | 'left' | 'right';

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
