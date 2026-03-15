import { CheckIcon, CopyIcon } from 'lucide-react';
import * as React from 'react';
import {
  Children,
  Suspense,
  isValidElement,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { useTheme } from '@/hooks/ui/use-theme';
import {
  getHighlighterPromise,
  type SupportedLanguage,
  type Highlighter,
  normalizeLanguage,
  highlightedCodeCache,
  createHighlightCacheKey,
  estimateHighlightedSize,
} from '@/lib/code-highlighting';
import { cn } from '@/lib/utils';
import type { Components } from 'react-markdown';

interface ChatMarkdownProps {
  text: string;
  className?: string;
}

interface CodeBlockErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

class CodeBlockErrorBoundary extends React.Component<
  CodeBlockErrorBoundaryProps,
  { hasError: boolean }
> {
  constructor(props: CodeBlockErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

function MarkdownCodeBlock({ code, children }: { code: string; children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(() => {
    if (typeof navigator === 'undefined' || navigator.clipboard === null) {
      return;
    }
    void navigator.clipboard
      .writeText(code)
      .then(() => {
        if (copiedTimerRef.current !== null) {
          clearTimeout(copiedTimerRef.current);
        }
        setCopied(true);
        copiedTimerRef.current = setTimeout(() => {
          setCopied(false);
          copiedTimerRef.current = null;
        }, 1200);
      })
      .catch(() => undefined);
  }, [code]);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative group">
      <button
        type="button"
        className="absolute right-2 top-2 z-10 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-foreground"
        onClick={handleCopy}
        title={copied ? 'Copied' : 'Copy code'}
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </button>
      {children}
    </div>
  );
}

interface SuspenseShikiCodeBlockProps {
  className: string | undefined;
  code: string;
  theme: 'light' | 'dark';
  isStreaming: boolean;
}

function SuspenseShikiCodeBlock({
  className,
  code,
  theme,
  isStreaming,
}: SuspenseShikiCodeBlockProps) {
  const language = extractFenceLanguage(className);
  const cacheKey = createHighlightCacheKey(code, language, theme);
  const cachedHighlightedHtml = !isStreaming ? highlightedCodeCache.get(cacheKey) : null;

  if (cachedHighlightedHtml !== null) {
    return (
      <div
        className="chat-markdown-shiki overflow-x-auto rounded-lg bg-muted/50 p-3 text-sm"
        dangerouslySetInnerHTML={{ __html: cachedHighlightedHtml as string }}
      />
    );
  }

  const highlighter = use(getHighlighterPromise(language, theme)) as Highlighter;

  const highlightedHtml = React.useMemo(() => {
    try {
      return highlighter.codeToHtml(code, {
        lang: language as SupportedLanguage,
        theme: theme === 'dark' ? 'github-dark' : 'github-light',
      });
    } catch (error) {
      console.warn(
        `Code highlighting failed for language "${language}", falling back to plain text.`,
        error instanceof Error ? error.message : error,
      );
      return highlighter.codeToHtml(code, {
        lang: 'text',
        theme: theme === 'dark' ? 'github-dark' : 'github-light',
      });
    }
  }, [code, highlighter, language, theme]);

  React.useEffect(() => {
    if (!isStreaming) {
      highlightedCodeCache.set(
        cacheKey,
        highlightedHtml,
        estimateHighlightedSize(highlightedHtml, code),
      );
    }
  }, [cacheKey, code, highlightedHtml, isStreaming]);

  return (
    <div
      className="chat-markdown-shiki overflow-x-auto rounded-lg bg-muted/50 p-3 text-sm"
      dangerouslySetInnerHTML={{ __html: highlightedHtml }}
    />
  );
}

function extractFenceLanguage(className: string | undefined): string {
  const match = className?.match(/(?:^|\s)language-([^\s]+)/);
  const raw = match?.[1] ?? 'text';
  return normalizeLanguage(raw);
}

function nodeToPlainText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map((child) => nodeToPlainText(child)).join('');
  }
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    return nodeToPlainText(node.props.children);
  }
  return '';
}

function extractCodeBlock(
  children: React.ReactNode,
): { className: string | undefined; code: string } | null {
  const childNodes = Children.toArray(children);
  if (childNodes.length !== 1) {
    return null;
  }

  const onlyChild = childNodes[0];
  if (
    !isValidElement<{ className?: string; children?: React.ReactNode }>(onlyChild) ||
    onlyChild.type !== 'code'
  ) {
    return null;
  }

  return {
    className: onlyChild.props.className,
    code: nodeToPlainText(onlyChild.props.children),
  };
}

function MarkdownAnchor({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (!href) return;
      const isExternal = /^https?:\/\//i.test(href);
      if (!isExternal) return;
      e.preventDefault();
      if (window.api?.shell?.openExternal) {
        void window.api.shell.openExternal(href);
      } else {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
    },
    [href],
  );

  return (
    <a {...props} href={href} onClick={handleClick} rel="noopener noreferrer">
      {children}
    </a>
  );
}

function MarkdownImage(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span className="my-1.5 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <span>Image</span>
      </span>
    );
  }

  return <img {...props} onError={() => setBroken(true)} />;
}

function ChatMarkdown({ text, className }: ChatMarkdownProps) {
  const { mode } = useTheme();

  const effectiveTheme = mode === 'dark' ? 'dark' : 'light';

  const markdownComponents = useMemo<Components>(() => {
    return {
      img: MarkdownImage,
      a: MarkdownAnchor,
      pre({ node: _node, children, ...props }) {
        const codeBlock = extractCodeBlock(children);
        if (!codeBlock) {
          return <pre {...props}>{children}</pre>;
        }

        return (
          <MarkdownCodeBlock code={codeBlock.code}>
            <CodeBlockErrorBoundary fallback={<pre {...props}>{children}</pre>}>
              <Suspense fallback={<pre {...props}>{children}</pre>}>
                <SuspenseShikiCodeBlock
                  className={codeBlock.className}
                  code={codeBlock.code}
                  theme={effectiveTheme}
                  isStreaming={false}
                />
              </Suspense>
            </CodeBlockErrorBoundary>
          </MarkdownCodeBlock>
        );
      },
    };
  }, [effectiveTheme]);

  return (
    <div
      className={cn(
        'prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export default memo(ChatMarkdown);
