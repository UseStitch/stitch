import * as React from 'react';

import { parseLiquidUiSpec } from '@stitch/shared/liquid-ui/parse';
import { liquidUiNodeSchema, type LiquidUiSpec } from '@stitch/shared/liquid-ui/schema';

import { Skeleton } from '@/components/ui/skeleton';

import { renderLiquidUiNode } from './registry.js';

type LiquidUiProps = { spec: unknown };
type ErrorBoundaryProps = { children: React.ReactNode; fallback: React.ReactNode };
type ErrorBoundaryState = { hasError: boolean; lastGood: React.ReactNode | null };

class LiquidUiErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, lastGood: null };

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidUpdate(previousProps: ErrorBoundaryProps) {
    if (!this.state.hasError && previousProps.children !== this.props.children) {
      this.setState({ lastGood: previousProps.children });
    }
  }

  render() {
    if (this.state.hasError) return this.state.lastGood ?? this.props.fallback;
    return this.props.children;
  }
}

function isObject(input: unknown): input is Record<string, unknown> {
  return input !== null && typeof input === 'object';
}

function salvageSpec(input: unknown): LiquidUiSpec | null {
  if (!isObject(input) || typeof input.root !== 'string' || !Array.isArray(input.nodes)) return null;

  const nodes = input.nodes.flatMap((node) => {
    const result = liquidUiNodeSchema.safeParse(node);
    return result.success ? [result.data] : [];
  });
  if (!nodes.some((node) => node.id === input.root)) return null;

  return { root: input.root, nodes };
}

function toRenderableSpec(input: unknown): LiquidUiSpec | null {
  const parsed = parseLiquidUiSpec(input);
  if (parsed.ok) return parsed.spec;
  return salvageSpec(input);
}

function MissingNode() {
  return <Skeleton className="h-10 w-full rounded-lg" />;
}

function LiquidUiTree({ spec }: { spec: LiquidUiSpec }) {
  const nodesById = new Map(spec.nodes.map((node) => [node.id, node] as const));

  function renderNodeById(id: string, path: Set<string>): React.ReactNode {
    const node = nodesById.get(id);
    if (!node) return <MissingNode key={id} />;
    if (path.has(id)) return null;

    const nextPath = new Set(path);
    nextPath.add(id);
    return <React.Fragment key={id}>{renderLiquidUiNode(node, (children) => renderChildren(children, nextPath))}</React.Fragment>;
  }

  function renderChildren(children: string[], path: Set<string>) {
    return children.map((childId) => renderNodeById(childId, path));
  }

  return <>{renderNodeById(spec.root, new Set())}</>;
}

function LiquidUiFallback({ spec }: { spec: unknown }) {
  return (
    <div className="w-full rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
      Unable to render UI spec.
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words">
        {JSON.stringify(spec, null, 2)}
      </pre>
    </div>
  );
}

export function LiquidUi({ spec }: LiquidUiProps) {
  const renderableSpec = toRenderableSpec(spec);
  const fallback = <LiquidUiFallback spec={spec} />;

  if (!renderableSpec) return fallback;

  return (
    <LiquidUiErrorBoundary fallback={fallback}>
      <div className="my-2 w-full min-w-0"> <LiquidUiTree spec={renderableSpec} /></div>
    </LiquidUiErrorBoundary>
  );
}
