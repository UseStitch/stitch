import * as React from 'react';

import { Button } from '@/components/ui/button';

const BLOCKED_IMAGE_SRC = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';

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

function buildSandboxedMailHtml(input: { bodyHtml: string | null; bodyText: string | null; loadImages: boolean }): string {
  const parser = new DOMParser();
  const html = input.bodyHtml ?? `<pre>${escapeHtml(input.bodyText ?? '')}</pre>`;
  const doc = parser.parseFromString(html, 'text/html');

  doc.querySelectorAll('script, object, embed, iframe, form').forEach((node) => node.remove());
  doc.querySelectorAll('a').forEach((link) => {
    link.setAttribute('target', '_blank');
    link.setAttribute('rel', 'noreferrer noopener');
  });
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src');
    if (src && isRemoteSrc(src) && !input.loadImages) {
      img.setAttribute('data-blocked-src', src);
      img.setAttribute('src', BLOCKED_IMAGE_SRC);
      img.setAttribute('alt', img.getAttribute('alt') || 'Remote image blocked');
    }
  });

  return `<!doctype html><html><head><base target="_blank"><style>body{margin:0;background:transparent;color:CanvasText;font:14px system-ui,sans-serif;line-height:1.5;overflow-wrap:anywhere}img{max-width:100%;height:auto}pre{white-space:pre-wrap;font:inherit}</style></head><body>${doc.body.innerHTML}</body></html>`;
}

export function MessageBody({ bodyHtml, bodyText }: { bodyHtml: string | null; bodyText: string | null }) {
  const [loadImages, setLoadImages] = React.useState(false);
  const srcDoc = React.useMemo(() => buildSandboxedMailHtml({ bodyHtml, bodyText, loadImages }), [bodyHtml, bodyText, loadImages]);

  return (
    <div className="space-y-2">
      {!loadImages && bodyHtml ? (
        <Button variant="outline" size="xs" onClick={() => setLoadImages(true)}>
          Load remote images
        </Button>
      ) : null}
      <iframe title="Message body" sandbox="" srcDoc={srcDoc} className="h-96 w-full rounded-md border border-border bg-background" />
    </div>
  );
}
