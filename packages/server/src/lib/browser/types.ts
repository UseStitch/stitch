export type BrowserTab = {
  id: string;
  title: string;
  url: string;
  type: string;
};

export type ScreenshotResult = {
  data: string;
  format: 'png' | 'jpeg';
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

export type DropdownOption = {
  index: number;
  text: string;
  value: string;
  selected: boolean;
  disabled: boolean;
};

export type DropdownOptionsResult = {
  type: string;
  options: DropdownOption[];
};

export type ExtractContentResult = {
  text: string;
  links?: Array<{ text: string; href: string }>;
  images?: Array<{ alt: string; src: string }>;
  data?: Record<string, string | string[]>;
};
