import TurndownService from 'turndown';
import { tool } from 'ai';
import { z } from 'zod';

import type { ToolContext } from '@/tools/wrappers.js';
import { withPermissionGate, withTruncation } from '@/tools/wrappers.js';

const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_TIMEOUT_SECONDS = 30;
const MAX_TIMEOUT_SECONDS = 120;

const webfetchInputSchema = z.object({
  url: z.string().describe('The URL to fetch content from'),
  format: z
    .enum(['text', 'markdown', 'html'])
    .default('markdown')
    .describe('The format to return the content in (text, markdown, or html). Defaults to markdown.'),
  timeout: z.number().optional().describe('Optional timeout in seconds (max 120)'),
});

const markdownConverter = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
});

markdownConverter.remove(['script', 'style', 'meta', 'link']);

function validateAndNormalizeUrl(input: string): string {
  const withHttps = input.startsWith('http://') ? `https://${input.slice('http://'.length)}` : input;
  const parsed = new URL(withHttps);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('URL must start with http:// or https://');
  }
  return parsed.toString();
}

function buildAcceptHeader(format: 'markdown' | 'text' | 'html'): string {
  if (format === 'markdown') {
    return 'text/markdown;q=1.0, text/x-markdown;q=0.9, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1';
  }
  if (format === 'text') {
    return 'text/plain;q=1.0, text/markdown;q=0.9, text/html;q=0.8, */*;q=0.1';
  }
  return 'text/html;q=1.0, application/xhtml+xml;q=0.9, text/plain;q=0.8, text/markdown;q=0.7, */*;q=0.1';
}

function toSafeTimeoutMs(timeoutSeconds: number | undefined): number {
  const seconds = timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS;
  return Math.min(Math.max(1, seconds), MAX_TIMEOUT_SECONDS) * 1000;
}

function parseContentType(contentType: string | null): { mime: string; full: string } {
  const full = contentType ?? '';
  const mime = full.split(';')[0]?.trim().toLowerCase() ?? '';
  return { mime, full };
}

function decodeHtmlEntities(value: string): string {
  return value
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function extractTextFromHtml(html: string): string {
  const withoutIgnored = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, ' ')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, ' ')
    .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, ' ');

  return decodeHtmlEntities(withoutIgnored.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function convertHtmlToMarkdown(html: string): string {
  return markdownConverter.turndown(html);
}

function normalizeHostForSuggestion(hostname: string): string {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  const labels = host.split('.').filter(Boolean);

  if (labels.length < 2) return host;

  const secondLevelTlds = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'co.jp']);
  const lastTwo = `${labels[labels.length - 2]}.${labels[labels.length - 1]}`;
  if (secondLevelTlds.has(lastTwo) && labels.length >= 3) {
    return `${labels[labels.length - 3]}.${lastTwo}`;
  }

  return lastTwo;
}

export function extractDomainForPermission(urlInput: string): string | null {
  try {
    const normalized = validateAndNormalizeUrl(urlInput);
    const hostname = new URL(normalized).hostname;
    if (!hostname) return null;
    return normalizeHostForSuggestion(hostname);
  } catch {
    return null;
  }
}

function createWebfetchTool() {
  return tool({
    description: `Fetch content from a specified URL.

Takes a URL and optional format as input.
Fetches the URL content and converts it to the requested format (markdown by default).
Returns the content in the specified format.

Usage notes:
- If another tool offers better web fetching capabilities, use that tool instead.
- The URL must be fully formed.
- HTTP URLs are automatically upgraded to HTTPS.
- Format options: markdown (default), text, or html.
- This tool is read-only and does not modify files.
- Results may be summarized if content is very large.`,
    inputSchema: webfetchInputSchema,
    execute: async (input, { abortSignal }) => {
      const normalizedUrl = validateAndNormalizeUrl(input.url);
      const timeoutMs = toSafeTimeoutMs(input.timeout);

      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);
      const onAbort = () => timeoutController.abort();
      abortSignal?.addEventListener('abort', onAbort, { once: true });

      try {
        const headers = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
          Accept: buildAcceptHeader(input.format),
          'Accept-Language': 'en-US,en;q=0.9',
        };

        const firstResponse = await fetch(normalizedUrl, {
          signal: timeoutController.signal,
          headers,
        });

        const response =
          firstResponse.status === 403 && firstResponse.headers.get('cf-mitigated') === 'challenge'
            ? await fetch(normalizedUrl, {
                signal: timeoutController.signal,
                headers: { ...headers, 'User-Agent': 'openwork' },
              })
            : firstResponse;

        if (!response.ok) {
          throw new Error(`Request failed with status code: ${response.status}`);
        }

        const contentLength = response.headers.get('content-length');
        if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_SIZE_BYTES) {
          throw new Error('Response too large (exceeds 5MB limit)');
        }

        const arrayBuffer = await response.arrayBuffer();
        if (arrayBuffer.byteLength > MAX_RESPONSE_SIZE_BYTES) {
          throw new Error('Response too large (exceeds 5MB limit)');
        }

        const { mime, full } = parseContentType(response.headers.get('content-type'));
        const title = `${normalizedUrl} (${full})`;

        const isImage =
          mime.startsWith('image/') && mime !== 'image/svg+xml' && mime !== 'image/vnd.fastbidsheet';

        if (isImage) {
          const base64Content = Buffer.from(arrayBuffer).toString('base64');
          return {
            title,
            output: 'Image fetched successfully',
            metadata: {},
            attachments: [
              {
                type: 'file' as const,
                mime,
                url: `data:${mime};base64,${base64Content}`,
              },
            ],
          };
        }

        const content = new TextDecoder().decode(arrayBuffer);
        const isHtml = mime === 'text/html' || mime === 'application/xhtml+xml';

        if (input.format === 'html') {
          return { output: content, title, metadata: {} };
        }

        if (input.format === 'text') {
          return {
            output: isHtml ? extractTextFromHtml(content) : content,
            title,
            metadata: {},
          };
        }

        return {
          output: isHtml ? convertHtmlToMarkdown(content) : content,
          title,
          metadata: {},
        };
      } finally {
        clearTimeout(timeoutId);
        abortSignal?.removeEventListener('abort', onAbort);
      }
    },
  });
}

function createTool() {
  return createWebfetchTool();
}

function getPatternTargets(input: unknown): string[] {
  const url = (input as { url?: unknown })?.url;
  if (typeof url !== 'string' || url.length === 0) return [];
  const domain = extractDomainForPermission(url);
  return domain ? [domain] : [];
}

function getSuggestion(input: unknown) {
  const url = (input as { url?: unknown })?.url;
  if (typeof url !== 'string' || url.length === 0) return null;
  const domain = extractDomainForPermission(url);
  if (!domain) return null;
  return {
    message: `Always allow from ${domain}`,
    pattern: domain,
  };
}

const shouldTruncate = true;

export function createRegisteredTool(context: ToolContext) {
  const baseTool = createTool();
  const gatedTool = withPermissionGate(
    'webfetch',
    {
      getPatternTargets,
      getSuggestion,
    },
    baseTool,
    context,
  );

  return shouldTruncate ? withTruncation(gatedTool) : gatedTool;
}
