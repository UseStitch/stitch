import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { CheckIcon, CopyIcon } from 'lucide-react';
import * as React from 'react';
import { Children, Suspense, isValidElement, use, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { Button } from '@/components/ui/button';
import {
  getHighlighterPromise,
  type HighlightedCodeHast,
  type SupportedLanguage,
  normalizeLanguage,
  highlightedCodeCache,
  createHighlightCacheKey,
  estimateHighlightedSize,
} from '@/lib/code-highlighting';
import { normalizeInlineMath } from '@/lib/normalize-inline-math';
import { cn } from '@/lib/utils';
import type { Components, ExtraProps } from 'react-markdown';

const JSX_RUNTIME = { Fragment, jsx, jsxs };

type MarkdownPreProps = React.ComponentProps<'pre'> & ExtraProps;

interface ChatMarkdownProps {
  text: string;
  className?: string;
  isStreaming?: boolean;
}

interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
}

interface MarkdownTextNode extends MarkdownNode {
  type: 'text';
  value: string;
}

/** Plain-text stand-ins used while streaming, when KaTeX is skipped for performance. */
const STREAMING_LATEX_TEXT: Record<string, string> = { rightarrow: '\u2192' };
const LATEX_COMMAND_SPAN_REGEX = /\$\\{1,2}([a-zA-Z]+)\$/g;

interface CodeBlockErrorBoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

class CodeBlockErrorBoundary extends React.Component<CodeBlockErrorBoundaryProps, { hasError: boolean }> {
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

  const handleCopy = () => {
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
  };

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="group relative">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="absolute top-2 right-2 z-10 border border-border/50 bg-background/80 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-background hover:text-foreground"
        onClick={handleCopy}
        title={copied ? 'Copied' : 'Copy code'}
        aria-label={copied ? 'Copied' : 'Copy code'}>
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </Button>
      {children}
    </div>
  );
}

interface SuspenseShikiCodeBlockProps {
  className: string | undefined;
  code: string;
  isStreaming: boolean;
}

function SuspenseShikiCodeBlock({ className, code, isStreaming }: SuspenseShikiCodeBlockProps) {
  const language = extractFenceLanguage(className);
  const cacheKey = createHighlightCacheKey(code, language, 'dual');
  const cachedHighlightedHast = !isStreaming ? (highlightedCodeCache.get(cacheKey) ?? null) : null;

  if (cachedHighlightedHast !== null) {
    return (
      <div className="chat-markdown-shiki overflow-x-auto rounded-lg bg-muted/50 p-3 text-sm">
        {toJsxRuntime(cachedHighlightedHast, JSX_RUNTIME)}
      </div>
    );
  }

  const highlighter = use(getHighlighterPromise(language));

  let highlightedHast: HighlightedCodeHast;
  try {
    highlightedHast = highlighter.codeToHast(code, {
      lang: language as SupportedLanguage,
      themes: { light: 'github-light', dark: 'github-dark' },
    });
  } catch (error) {
    console.warn(
      `Code highlighting failed for language "${language}", falling back to plain text.`,
      error instanceof Error ? error.message : error,
    );
    highlightedHast = highlighter.codeToHast(code, {
      lang: 'text',
      themes: { light: 'github-light', dark: 'github-dark' },
    });
  }

  if (!isStreaming) {
    highlightedCodeCache.set(cacheKey, highlightedHast, estimateHighlightedSize(highlightedHast, code));
  }

  return (
    <div className="chat-markdown-shiki overflow-x-auto rounded-lg bg-muted/50 p-3 text-sm">
      {toJsxRuntime(highlightedHast, JSX_RUNTIME)}
    </div>
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

function extractCodeBlock(children: React.ReactNode): { className: string | undefined; code: string } | null {
  const childNodes = Children.toArray(children);
  if (childNodes.length !== 1) {
    return null;
  }

  const onlyChild = childNodes[0];
  if (!isValidElement<{ className?: string; children?: React.ReactNode }>(onlyChild) || onlyChild.type !== 'code') {
    return null;
  }

  return { className: onlyChild.props.className, code: nodeToPlainText(onlyChild.props.children) };
}

function splitLatexCommandSpans(node: MarkdownTextNode): MarkdownNode[] {
  const nodes: MarkdownNode[] = [];
  let lastIndex = 0;

  for (const match of node.value.matchAll(LATEX_COMMAND_SPAN_REGEX)) {
    const index = match.index;
    if (index === undefined) continue;

    const streamingText = STREAMING_LATEX_TEXT[match[1] ?? ''];
    if (streamingText === undefined) continue;

    if (index > lastIndex) {
      nodes.push({ type: 'text', value: node.value.slice(lastIndex, index) });
    }

    nodes.push({ type: 'text', value: streamingText });
    lastIndex = index + match[0].length;
  }

  if (nodes.length === 0) {
    return [node];
  }

  if (lastIndex < node.value.length) {
    nodes.push({ type: 'text', value: node.value.slice(lastIndex) });
  }

  return nodes;
}

function remarkStreamingSingleDollarLatexCommands() {
  return transformLatexCommandTextNodes;
}

function transformLatexCommandTextNodes(node: MarkdownNode) {
  if (!node.children) return;

  const transformedChildren: MarkdownNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      transformedChildren.push(...splitLatexCommandSpans(child as MarkdownTextNode));
      continue;
    }

    transformLatexCommandTextNodes(child);
    transformedChildren.push(child);
  }

  node.children = transformedChildren;
}

function MarkdownAnchor({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!href) return;
    const isExternal = /^https?:\/\//i.test(href);
    if (!isExternal) return;
    e.preventDefault();
    if (window.api?.shell?.openExternal) {
      void window.api.shell.openExternal(href);
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <a {...props} href={href} onClick={handleClick} rel="noopener noreferrer">
      {children}
    </a>
  );
}

function MarkdownImage({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <span className="my-1.5 inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <span>Image</span>
      </span>
    );
  }

  return <img {...props} alt={alt ?? ''} onError={() => setBroken(true)} />;
}

/** Plain `pre` used while streaming — Shiki highlighting is too expensive per token. */
function StreamingMarkdownPre({ node: _node, children, ...props }: MarkdownPreProps) {
  const codeBlock = extractCodeBlock(children);
  if (!codeBlock) {
    return <pre {...props}>{children}</pre>;
  }

  return (
    <MarkdownCodeBlock code={codeBlock.code}>
      <pre {...props}>{children}</pre>
    </MarkdownCodeBlock>
  );
}

function HighlightedMarkdownPre({ node: _node, children, ...props }: MarkdownPreProps) {
  const codeBlock = extractCodeBlock(children);
  if (!codeBlock) {
    return <pre {...props}>{children}</pre>;
  }

  return (
    <MarkdownCodeBlock code={codeBlock.code}>
      <CodeBlockErrorBoundary fallback={<pre {...props}>{children}</pre>}>
        <Suspense fallback={<pre {...props}>{children}</pre>}>
          <SuspenseShikiCodeBlock className={codeBlock.className} code={codeBlock.code} isStreaming={false} />
        </Suspense>
      </CodeBlockErrorBoundary>
    </MarkdownCodeBlock>
  );
}

const STREAMING_COMPONENTS: Components = { img: MarkdownImage, a: MarkdownAnchor, pre: StreamingMarkdownPre };
const HIGHLIGHTED_COMPONENTS: Components = { img: MarkdownImage, a: MarkdownAnchor, pre: HighlightedMarkdownPre };

export default function ChatMarkdown({ text, className, isStreaming = false }: ChatMarkdownProps) {
  const markdownComponents = isStreaming ? STREAMING_COMPONENTS : HIGHLIGHTED_COMPONENTS;

  // During streaming: use remarkGfm only — skip remark-math + rehype-katex (heavy)
  const remarkPlugins = (() => {
    if (isStreaming) return [remarkGfm, remarkStreamingSingleDollarLatexCommands];

    const remarkMathWithoutSingleDollar = [remarkMath, { singleDollarTextMath: false }] as [
      typeof remarkMath,
      { singleDollarTextMath: false },
    ];
    return [remarkGfm, remarkMathWithoutSingleDollar];
  })();
  const rehypePlugins = isStreaming ? [] : [rehypeKatex];
  const source = isStreaming ? text : normalizeInlineMath(text);

  return (
    <div className={cn('prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
