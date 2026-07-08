import DOMPurify from 'dompurify';
import * as React from 'react';

import { useSuspenseQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { useTheme } from '@/hooks/ui/use-theme';
import { settingsQueryOptions } from '@/lib/queries/settings';

const BLOCKED_IMAGE_SRC = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
const LIGHT_MAIL_BACKGROUND = '#ffffff';
const LIGHT_MAIL_FOREGROUND = '#111827';
const DARK_MAIL_BACKGROUND = '#111827';
const DARK_MAIL_FOREGROUND = '#f9fafb';
const MIN_TEXT_CONTRAST = 4.5;
const MAX_FRAME_HEIGHT = 720;
const MIN_FRAME_HEIGHT = 320;
const FRAME_VIEWPORT_RATIO = 0.65;
const QUOTED_REPLY_MARKER_SELECTORS = [
  '.gmail_quote',
  '.protonmail_quote',
  '.yahoo_quoted',
  '.moz-cite-prefix',
  'blockquote[type="cite"]',
  'blockquote.gmail_quote',
  'blockquote[id="iosymail"]',
  'blockquote[id="isReplyContent"]',
  'blockquote[id="oriMsgHtmlSeperator"]',
  '[id="divRplyFwdMsg"]',
  '[id="tutanota_quote"]',
  '[id="zmail_extra"]',
  '[id="isForwardContent"]',
  '[name="quote"]',
].join(',');
const QUOTED_REPLY_SELECTORS = `${QUOTED_REPLY_MARKER_SELECTORS},blockquote`;

const IGNORED_CONTENT_TAGS = new Set(['BASE', 'HEAD', 'LINK', 'META', 'SCRIPT', 'STYLE', 'TITLE']);
const VISUAL_CONTENT_TAGS = new Set(['IMG', 'SVG', 'TABLE', 'VIDEO', 'AUDIO', 'CANVAS']);
const IGNORED_MAIL_TEXT_CHARS = new Set(['\u200b', '\u200c', '\u200d', '\ufeff']);

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

export function hasMeaningfulMailText(value: string): boolean {
  return Array.from(value).some((char) => !/\s/u.test(char) && !IGNORED_MAIL_TEXT_CHARS.has(char));
}

export function hasReplyAttributionText(value: string): boolean {
  return /(?:^|\s)(?:on .{1,240} wrote:|[-]+\s*original message\s*[-]+)$/i.test(value.slice(-320));
}

function hasMeaningfulMailContent(node: Node): boolean {
  if (node.nodeType === Node.TEXT_NODE) return hasMeaningfulMailText(node.textContent ?? '');
  if (!(node instanceof Element) || IGNORED_CONTENT_TAGS.has(node.tagName)) return false;
  if (VISUAL_CONTENT_TAGS.has(node.tagName)) return true;

  return Array.from(node.childNodes).some(hasMeaningfulMailContent);
}

function hasMeaningfulContentBeside(node: Element, direction: 'previous' | 'next'): boolean {
  let current: Node | null = node;
  while (current?.parentNode) {
    let sibling = direction === 'previous' ? current.previousSibling : current.nextSibling;
    while (sibling) {
      if (hasMeaningfulMailContent(sibling)) return true;
      sibling = direction === 'previous' ? sibling.previousSibling : sibling.nextSibling;
    }

    current = current.parentNode;
    if (current === node.ownerDocument.body) break;
  }

  return false;
}

function getTextBeside(node: Element, direction: 'previous' | 'next'): string {
  const text: string[] = [];
  let current: Node | null = node;
  while (current?.parentNode) {
    let sibling = direction === 'previous' ? current.previousSibling : current.nextSibling;
    while (sibling) {
      text.push(sibling.textContent ?? '');
      sibling = direction === 'previous' ? sibling.previousSibling : sibling.nextSibling;
    }

    current = current.parentNode;
    if (current === node.ownerDocument.body) break;
  }

  return direction === 'previous' ? text.reverse().join(' ') : text.join(' ');
}

function hasReplyAttributionBefore(node: Element): boolean {
  const before = getTextBeside(node, 'previous').replace(/\s+/g, ' ').trim();
  return hasReplyAttributionText(before);
}

function isQuotedReplyCandidate(element: Element): boolean {
  return element.matches(QUOTED_REPLY_MARKER_SELECTORS) || hasReplyAttributionBefore(element);
}

function findTrailingQuotedReply(doc: Document): Element | null {
  const candidates = Array.from(doc.body.querySelectorAll(QUOTED_REPLY_SELECTORS)).filter(
    (element) => isQuotedReplyCandidate(element) && !element.parentElement?.closest(QUOTED_REPLY_SELECTORS),
  );

  return (
    candidates.find(
      (element) =>
        hasMeaningfulMailContent(element) &&
        hasMeaningfulContentBeside(element, 'previous') &&
        !hasMeaningfulContentBeside(element, 'next'),
    ) ?? null
  );
}

function collapseTrailingQuotedReply(doc: Document) {
  const quotedReply = findTrailingQuotedReply(doc);
  if (!quotedReply?.parentNode) return;

  const details = doc.createElement('details');
  details.className = 'stitch-quoted-reply';

  const summary = doc.createElement('summary');
  summary.textContent = 'Show quoted text';
  details.append(summary);

  quotedReply.parentNode.insertBefore(details, quotedReply);
  details.append(quotedReply);
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
  collapseQuotedReplies: boolean;
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

  if (input.collapseQuotedReplies) collapseTrailingQuotedReply(sanitizedDoc);

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

  return `<!doctype html><html><head><base target="_blank"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; frame-ancestors 'none'"><meta name="color-scheme" content="${colorScheme}"><style>html{background:${background};color-scheme:${colorScheme};scrollbar-color:${scrollbarThumb} transparent;scrollbar-width:thin}body{box-sizing:border-box;margin:0;background:${background};color:${foreground};font:14px system-ui,sans-serif;line-height:1.5;overflow-wrap:anywhere;padding:16px}*{box-sizing:border-box}html::-webkit-scrollbar{width:6px;height:6px}html::-webkit-scrollbar-track{background:transparent}html::-webkit-scrollbar-thumb{background-color:${scrollbarThumb};border-radius:9999px}html::-webkit-scrollbar-thumb:hover{background-color:${scrollbarThumbHover}}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}table{max-width:100%}a{color:#2563eb}.stitch-quoted-reply{margin-top:12px;border-top:1px solid color-mix(in srgb,currentColor 18%,transparent);padding-top:8px}.stitch-quoted-reply:not([open])>:not(summary){display:none!important}.stitch-quoted-reply>summary{cursor:pointer;color:#6b7280;font-size:12px;list-style:none;user-select:none}.stitch-quoted-reply>summary::-webkit-details-marker{display:none}.stitch-quoted-reply>summary::before{content:'...';display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:18px;margin-right:6px;border:1px solid color-mix(in srgb,currentColor 28%,transparent);border-radius:9999px;font-weight:600;line-height:1}.stitch-quoted-reply[open]>summary{margin-bottom:8px}</style></head><body>${sanitizedDoc.body.innerHTML}</body></html>`;
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

function hasDirectMeaningfulContent(element: Element): boolean {
  return Array.from(element.childNodes).some((node) => {
    if (node.nodeType === Node.TEXT_NODE) return hasMeaningfulMailText(node.textContent ?? '');
    return node instanceof Element && VISUAL_CONTENT_TAGS.has(node.tagName);
  });
}

function isHiddenByClosedDetails(element: Element): boolean {
  const details = element.closest('details:not([open])');
  return Boolean(details && element.tagName !== 'SUMMARY' && !element.closest('summary'));
}

function getBodyContentHeight(doc: Document): number {
  const paddingBottom = Number.parseFloat(doc.defaultView?.getComputedStyle(doc.body).paddingBottom ?? '0') || 0;
  const collapsedQuotedReplySummary = doc.body.querySelector('details.stitch-quoted-reply:not([open]) > summary');
  if (collapsedQuotedReplySummary) {
    const bodyTop = doc.body.getBoundingClientRect().top;
    return Math.ceil(collapsedQuotedReplySummary.getBoundingClientRect().bottom - bodyTop + paddingBottom);
  }

  const children = Array.from(doc.body.querySelectorAll('*')).filter((element) => {
    if (isHiddenByClosedDetails(element) || !hasDirectMeaningfulContent(element)) return false;

    const style = doc.defaultView?.getComputedStyle(element);
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  });
  if (children.length === 0) return doc.body.scrollHeight;

  const bodyTop = doc.body.getBoundingClientRect().top;
  const contentBottom = Math.max(...children.map((child) => child.getBoundingClientRect().bottom - bodyTop));
  return Math.ceil(contentBottom + paddingBottom);
}

export function MessageBody({
  bodyHtml,
  bodyText,
  collapseQuotedReplies = false,
  fillAvailableHeight = false,
}: {
  bodyHtml: string | null;
  bodyText: string | null;
  collapseQuotedReplies?: boolean;
  fillAvailableHeight?: boolean;
}) {
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const alwaysLoadRemoteImages = settings['mail.alwaysLoadRemoteImages'] !== 'false';
  const [loadImagesForMessage, setLoadImagesForMessage] = React.useState(false);
  const loadImages = alwaysLoadRemoteImages || loadImagesForMessage;
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
  const mutationObserverRef = React.useRef<MutationObserver | null>(null);
  const isDark = useIsDarkMode();
  const srcDoc = React.useMemo(
    () => buildSandboxedMailHtml({ bodyHtml, bodyText, loadImages, isDark, collapseQuotedReplies }),
    [bodyHtml, bodyText, collapseQuotedReplies, isDark, loadImages],
  );

  React.useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      mutationObserverRef.current?.disconnect();
    };
  }, []);

  function updateFrameHeight(doc: Document) {
    const iframe = iframeRef.current;
    if (!iframe) return;

    iframe.style.height = `${MIN_FRAME_HEIGHT}px`;
    iframe.style.height = `${getFrameHeight(getBodyContentHeight(doc))}px`;
  }

  function scheduleFrameHeightUpdate(doc: Document) {
    updateFrameHeight(doc);
    requestAnimationFrame(() => updateFrameHeight(doc));
  }

  function handleFrameLoad() {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;

    resizeObserverRef.current?.disconnect();
    mutationObserverRef.current?.disconnect();
    if (isDark) repairLowContrastText(doc);
    updateFrameHeight(doc);

    doc.querySelectorAll('details').forEach((details) => {
      details.addEventListener('toggle', () => scheduleFrameHeightUpdate(doc));
    });

    resizeObserverRef.current = new ResizeObserver(() => updateFrameHeight(doc));
    resizeObserverRef.current.observe(doc.body);
    doc.querySelectorAll('details').forEach((details) => resizeObserverRef.current?.observe(details));

    mutationObserverRef.current = new MutationObserver(() => scheduleFrameHeightUpdate(doc));
    doc.querySelectorAll('details').forEach((details) => {
      mutationObserverRef.current?.observe(details, { attributes: true, attributeFilter: ['open'] });
    });
  }

  return (
    <div className={fillAvailableHeight ? 'flex min-h-0 flex-1 flex-col space-y-2' : 'space-y-2'}>
      {!loadImages && bodyHtml ? (
        <Button variant="outline" size="xs" onClick={() => setLoadImagesForMessage(true)}>
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
        className={
          fillAvailableHeight
            ? 'thin-scrollbar min-h-32 w-full flex-1 rounded-md border border-border bg-card'
            : 'thin-scrollbar min-h-32 w-full rounded-md border border-border bg-card'
        }
      />
    </div>
  );
}
