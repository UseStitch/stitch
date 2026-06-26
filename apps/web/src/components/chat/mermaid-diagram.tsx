import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

interface MermaidDiagramProps {
  code: string;
  isStreaming: boolean;
  fallback: React.ReactNode;
}

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void;
  parse: (code: string, options?: { suppressErrors?: boolean }) => Promise<boolean | undefined>;
  render: (id: string, code: string) => Promise<{ svg: string }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (mermaidPromise === null) {
    mermaidPromise = import('mermaid').then((mod) => {
      const mermaid = mod.default as unknown as MermaidApi;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
      return mermaid;
    });
  }
  return mermaidPromise;
}

function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

let diagramIdCounter = 0;

function MermaidDiagram({ code, isStreaming, fallback }: MermaidDiagramProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [dark, setDark] = useState(() =>
    typeof document === 'undefined' ? false : isDarkMode(),
  );
  const idRef = useRef(`mermaid-${(diagramIdCounter += 1)}`);

  useEffect(() => {
    const observer = new MutationObserver(() => setDark(isDarkMode()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isStreaming) return;

    let cancelled = false;
    setFailed(false);

    void loadMermaid()
      .then(async (mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: dark ? 'dark' : 'default',
        });

        // Validate first: parse() with suppressErrors avoids mermaid injecting
        // its global error graphic into the DOM when render() would throw.
        const valid = await mermaid.parse(code, { suppressErrors: true });
        if (cancelled) return;
        if (valid !== true) {
          setFailed(true);
          return;
        }

        const result = await mermaid.render(idRef.current, code);
        if (!cancelled) setSvg(result.svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [code, isStreaming, dark]);

  if (failed) {
    return <>{fallback}</>;
  }

  if (isStreaming || svg === null) {
    return (
      <div className="chat-mermaid chat-mermaid-pending" aria-busy="true">
        {fallback}
      </div>
    );
  }

  return (
    <div
      className={cn('chat-mermaid')}
      role="img"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default MermaidDiagram;
