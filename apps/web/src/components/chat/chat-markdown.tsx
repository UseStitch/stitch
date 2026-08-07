import { toJsxRuntime } from 'hast-util-to-jsx-runtime';
import { CheckIcon, CopyIcon } from 'lucide-react';
import * as React from 'react';
import { Children, Suspense, isValidElement, use, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Fragment, jsx, jsxs } from 'react/jsx-runtime';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { Icon } from '@/components/primitives/icon.js';
import { Text } from '@/components/primitives/text.js';
import { Button } from '@/components/ui/button';
import { useCodeTheme } from '@/hooks/ui/use-code-theme';
import {
  getHighlighterPromise,
  highlightToHast,
  type SupportedLanguage,
  normalizeLanguage,
  highlightedCodeCache,
  createHighlightCacheKey,
  estimateHighlightedSize,
} from '@/lib/code-highlighting';
import { remarkGithubCallouts } from '@/lib/markdown-callouts';
import { rehypeNormalizeUrlProtocols } from '@/lib/markdown-normalize-urls';
import { markdownSanitizeSchema } from '@/lib/markdown-sanitize-schema';
import { remarkTextMarks } from '@/lib/markdown-text-marks';
import { normalizeInlineMath } from '@/lib/normalize-inline-math';
import { cn } from 'cnfast';

import type { Components, ExtraProps, Options } from 'react-markdown';

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
      if (!(copiedTimerRef.current !== null)) {
        return;
      }

      clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    };
  }, []);

  return (
    <div className="group relative">
      <span className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={handleCopy}
          title={copied ? 'Copied' : 'Copy code'}
          aria-label={copied ? 'Copied' : 'Copy code'}>
          {copied ? <Icon as={CheckIcon} size="s" /> : <Icon as={CopyIcon} size="s" />}
        </Button>
      </span>
      {children}
    </div>
  );
}

interface SuspenseShikiCodeBlockProps {
  className: string | undefined;
  code: string;
}

function SuspenseShikiCodeBlock({ className, code }: SuspenseShikiCodeBlockProps) {
  const codeTheme = useCodeTheme();
  const language = extractFenceLanguage(className);
  const cacheKey = createHighlightCacheKey(code, language, `${codeTheme.light}-${codeTheme.dark}`);
  const cachedHighlightedHast = highlightedCodeCache.get(cacheKey) ?? null;

  if (cachedHighlightedHast !== null) {
    return toJsxRuntime(cachedHighlightedHast, JSX_RUNTIME);
  }

  const highlighter = use(getHighlighterPromise(language, [codeTheme.light, codeTheme.dark]));
  const highlightedHast = highlightToHast(highlighter, code, language, codeTheme);

  highlightedCodeCache.set(cacheKey, highlightedHast, estimateHighlightedSize(highlightedHast, code));

  return toJsxRuntime(highlightedHast, JSX_RUNTIME);
}

function extractFenceLanguage(className: string | undefined): SupportedLanguage {
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
      <div className="my-space-s inline-flex items-center gap-space-s rounded-lg border border-border-subtle bg-surface-sunken px-space-l py-space-s">
        <Text as="span" variant="caption" tone="muted">
          Image
        </Text>
      </div>
    );
  }

  return <img {...props} alt={alt ?? ''} onError={() => setBroken(true)} />;
}

/** Plain `pre` used while streaming — Shiki highlighting is too expensive per token. */
function StreamingMarkdownPre({ node: _node, children, ...props }: MarkdownPreProps) {
  const codeBlock = extractCodeBlock(children);
  if (!codeBlock) {
    return (
      <pre {...props} className={cn('thin-scrollbar', props.className)}>
        {children}
      </pre>
    );
  }

  return (
    <MarkdownCodeBlock code={codeBlock.code}>
      <pre {...props} className={cn('thin-scrollbar', props.className)}>
        {children}
      </pre>
    </MarkdownCodeBlock>
  );
}

function HighlightedMarkdownPre({ node: _node, children, ...props }: MarkdownPreProps) {
  const codeBlock = extractCodeBlock(children);
  if (!codeBlock) {
    return (
      <pre {...props} className={cn('thin-scrollbar', props.className)}>
        {children}
      </pre>
    );
  }

  // Styled identically to Shiki's output, so only token colors appear once highlighting resolves.
  const plainFallback = (
    <pre {...props} className={cn('thin-scrollbar', props.className)}>
      {children}
    </pre>
  );

  return (
    <MarkdownCodeBlock code={codeBlock.code}>
      <CodeBlockErrorBoundary fallback={plainFallback}>
        <Suspense fallback={plainFallback}>
          <SuspenseShikiCodeBlock className={codeBlock.className} code={codeBlock.code} />
        </Suspense>
      </CodeBlockErrorBoundary>
    </MarkdownCodeBlock>
  );
}

const STREAMING_COMPONENTS: Components = { img: MarkdownImage, a: MarkdownAnchor, pre: StreamingMarkdownPre };
const HIGHLIGHTED_COMPONENTS: Components = { img: MarkdownImage, a: MarkdownAnchor, pre: HighlightedMarkdownPre };

// `singleTilde: false` frees `~sub~` for remarkTextMarks; `~~strike~~` is unaffected.
const GFM_PLUGIN: [typeof remarkGfm, { singleTilde: false }] = [remarkGfm, { singleTilde: false }];

const STREAMING_REMARK_PLUGINS: Options['remarkPlugins'] = [
  GFM_PLUGIN,
  remarkGithubCallouts,
  remarkTextMarks,
  remarkStreamingSingleDollarLatexCommands,
];

const REMARK_PLUGINS: Options['remarkPlugins'] = [
  GFM_PLUGIN,
  remarkGithubCallouts,
  remarkTextMarks,
  [remarkMath, { singleDollarTextMath: false }],
];

/** Raw HTML must be parsed before it can be sanitized, and sanitizing must not touch KaTeX output. */
const REHYPE_PLUGINS: Options['rehypePlugins'] = [
  rehypeRaw,
  rehypeNormalizeUrlProtocols,
  [rehypeSanitize, markdownSanitizeSchema],
  rehypeKatex,
];

/** Streaming still sanitizes HTML but skips the more expensive KaTeX typesetting pass. */
const STREAMING_REHYPE_PLUGINS: Options['rehypePlugins'] = [
  rehypeRaw,
  rehypeNormalizeUrlProtocols,
  [rehypeSanitize, markdownSanitizeSchema],
];

export default function ChatMarkdown({ text, className, isStreaming = false }: ChatMarkdownProps) {
  const markdownComponents = isStreaming ? STREAMING_COMPONENTS : HIGHLIGHTED_COMPONENTS;
  const remarkPlugins = isStreaming ? STREAMING_REMARK_PLUGINS : REMARK_PLUGINS;
  const rehypePlugins = isStreaming ? STREAMING_REHYPE_PLUGINS : REHYPE_PLUGINS;
  const source = isStreaming ? text : normalizeInlineMath(text);

  return (
    <Text as="div" variant="body">
      <section className={cn('prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed', className)}>
        <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={markdownComponents}>
          {source}
        </ReactMarkdown>
      </section>
    </Text>
  );
}
