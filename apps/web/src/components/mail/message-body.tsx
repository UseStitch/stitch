import DOMPurify from 'dompurify';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/ui/use-theme';

const BLOCKED_IMAGE_SRC = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
const LIGHT_MAIL_BACKGROUND = '#ffffff';
const LIGHT_MAIL_FOREGROUND = '#111827';
const DARK_MAIL_BACKGROUND = '#111827';
const DARK_MAIL_FOREGROUND = '#f9fafb';
const MIN_TEXT_CONTRAST = 4.5;
const MAX_FRAME_HEIGHT = 720;
const MIN_FRAME_HEIGHT = 320;
const FRAME_VIEWPORT_RATIO = 0.65;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isRemoteSrc(src: string): boolean {
  return src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//');
}

function isTrackingPixel(img: HTMLImageElement): boolean {
  const width = Number(img.getAttribute('width')) || img.naturalWidth;
  const height = Number(img.getAttribute('height')) || img.naturalHeight;
  return width <= 1 && height <= 1;
}

function supportsDarkMode(doc: Document): boolean {
  const colorScheme = doc.querySelector('meta[name="color-scheme"], meta[name="supported-color-schemes"]');
  const content = colorScheme?.getAttribute('content')?.toLowerCase() ?? '';
  if (content.includes('dark')) return true;

  return Array.from(doc.querySelectorAll('style')).some((style) =>
    style.textContent?.toLowerCase().includes('prefers-color-scheme: dark'),
  );
}

function buildSandboxedMailHtml(input: {
  bodyHtml: string | null;
  bodyText: string | null;
  loadImages: boolean;
  isDark: boolean;
}): string {
  const parser = new DOMParser();
  const html = input.bodyHtml ?? `<pre>${escapeHtml(input.bodyText ?? '')}</pre>`;
  const doc = parser.parseFromString(html, 'text/html');
  const emailSupportsDarkMode = supportsDarkMode(doc);
  const background = input.isDark && !emailSupportsDarkMode ? DARK_MAIL_BACKGROUND : LIGHT_MAIL_BACKGROUND;
  const foreground = input.isDark && !emailSupportsDarkMode ? DARK_MAIL_FOREGROUND : LIGHT_MAIL_FOREGROUND;
  const colorScheme = input.isDark && emailSupportsDarkMode ? 'dark' : 'light';
  const scrollbarThumb = input.isDark ? '#374151' : '#d1d5db';
  const scrollbarThumbHover = input.isDark ? '#9ca3af' : '#6b7280';

  const sanitizedHtml = DOMPurify.sanitize(doc.body.innerHTML, {
    FORBID_TAGS: ['script', 'object', 'embed', 'iframe', 'form', 'input', 'button', 'textarea', 'select'],
    WHOLE_DOCUMENT: false,
  });
  const sanitizedDoc = parser.parseFromString(sanitizedHtml, 'text/html');

  sanitizedDoc.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noreferrer noopener');
  });
  sanitizedDoc.querySelectorAll('img').forEach((img) => {
    if (isTrackingPixel(img)) {
      img.remove();
      return;
    }

    const src = img.getAttribute('src');
    if (src && isRemoteSrc(src) && !input.loadImages) {
      img.setAttribute('data-blocked-src', src);
      img.setAttribute('src', BLOCKED_IMAGE_SRC);
      img.setAttribute('alt', img.getAttribute('alt') || 'Remote image blocked');
    }
  });

  const imgSrc = input.loadImages ? 'https: http: data: cid:' : 'data: cid:';

  return `<!doctype html><html><head><base target="_blank"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; frame-ancestors 'none'"><meta name="color-scheme" content="${colorScheme}"><style>html{background:${background};color-scheme:${colorScheme};scrollbar-color:${scrollbarThumb} transparent;scrollbar-width:thin}body{box-sizing:border-box;margin:0;background:${background};color:${foreground};font:14px system-ui,sans-serif;line-height:1.5;overflow-wrap:anywhere;padding:16px}*{box-sizing:border-box}html::-webkit-scrollbar{width:6px;height:6px}html::-webkit-scrollbar-track{background:transparent}html::-webkit-scrollbar-thumb{background-color:${scrollbarThumb};border-radius:9999px}html::-webkit-scrollbar-thumb:hover{background-color:${scrollbarThumbHover}}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}table{max-width:100%}a{color:#2563eb}</style></head><body>${sanitizedDoc.body.innerHTML}</body></html>`;
}

function parseRgb(value: string): [number, number, number, number] | null {
  const match = value.match(/^rgba?\(([^)]+)\)$/i);
  if (!match) return null;

  const parts = match[1].split(',').map((part) => Number(part.trim()));
  const [red, green, blue, alpha = 1] = parts;
  if (red === undefined || green === undefined || blue === undefined || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return [red, green, blue, alpha];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const [r, g, b] = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function getEffectiveBackgroundColor(element: Element, fallback: [number, number, number]): [number, number, number] {
  let current: Element | null = element;
  while (current) {
    const background = parseRgb(getComputedStyle(current).backgroundColor);
    if (background && background[3] >= 1) return [background[0], background[1], background[2]];
    current = current.parentElement;
  }

  return fallback;
}

function repairLowContrastText(doc: Document) {
  const fallbackBackground: [number, number, number] = [17, 24, 39];
  const elements = [doc.body, ...Array.from(doc.body.querySelectorAll('*'))];

  elements.forEach((element) => {
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return;

    const color = parseRgb(style.color);
    if (!color || color[3] === 0) return;

    const foreground: [number, number, number] = [color[0], color[1], color[2]];
    const background = getEffectiveBackgroundColor(element, fallbackBackground);
    if (contrastRatio(foreground, background) >= MIN_TEXT_CONTRAST) return;

    const blackContrast = contrastRatio([0, 0, 0], background);
    const whiteContrast = contrastRatio([255, 255, 255], background);
    (element as HTMLElement).style.color = blackContrast >= whiteContrast ? '#000000' : '#ffffff';
  });
}

function useIsDarkMode(): boolean {
  const { mode } = useTheme();
  const [systemIsDark, setSystemIsDark] = React.useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  React.useEffect(() => {
    if (mode !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemIsDark(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [mode]);

  return mode === 'dark' || (mode === 'system' && systemIsDark);
}

function getFrameHeight(contentHeight: number): number {
  const viewportMax = Math.round(window.innerHeight * FRAME_VIEWPORT_RATIO);
  const maxHeight = Math.max(MIN_FRAME_HEIGHT, Math.min(MAX_FRAME_HEIGHT, viewportMax));
  return Math.min(contentHeight, maxHeight);
}

export function MessageBody({ bodyHtml, bodyText }: { bodyHtml: string | null; bodyText: string | null }) {
  const [loadImages, setLoadImages] = React.useState(false);
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const isDark = useIsDarkMode();
  const srcDoc = React.useMemo(
    () => buildSandboxedMailHtml({ bodyHtml, bodyText, loadImages, isDark }),
    [bodyHtml, bodyText, isDark, loadImages],
  );

  React.useEffect(() => {
    return () => resizeObserverRef.current?.disconnect();
  }, []);

  function updateFrameHeight(doc: Document) {
    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.style.height = `${getFrameHeight(Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight))}px`;
  }

  function handleFrameLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    resizeObserverRef.current?.disconnect();
    if (isDark) repairLowContrastText(doc);
    updateFrameHeight(doc);

    resizeObserverRef.current = new ResizeObserver(() => updateFrameHeight(doc));
    resizeObserverRef.current.observe(doc.body);
  }

  return (
    <div className="space-y-2">
      {!loadImages && bodyHtml ? (
        <Button variant="outline" size="xs" onClick={() => setLoadImages(true)}>
          Load remote images
        </Button>
      ) : null}
      <iframe
        ref={iframeRef}
        title="Message body"
        sandbox="allow-same-origin"
        referrerPolicy="no-referrer"
        srcDoc={srcDoc}
        onLoad={handleFrameLoad}
        className="thin-scrollbar min-h-32 w-full rounded-md border border-border bg-card"
      />
    </div>
  );
}
