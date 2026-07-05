import * as React from 'react';

import { liquidUiNodeSchema, type LiquidUiSpec } from '@stitch/shared/liquid-ui/schema';

import { renderLiquidUiNode } from './registry.js';
import { repairLiquidUiSpec } from './repair.js';

import { Skeleton } from '@/components/ui/skeleton';

type LiquidUiProps = { spec: unknown };
type ErrorBoundaryProps = { children: React.ReactNode };
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
    if (this.state.hasError) return this.state.lastGood ?? null;
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
  const repaired = repairLiquidUiSpec(input);
  if (repaired) return repaired;
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
    return (
      <React.Fragment key={id}>
        {renderLiquidUiNode(node, (children) => renderChildren(children, nextPath))}
      </React.Fragment>
    );
  }

  function renderChildren(children: string[], path: Set<string>) {
    return children.map((childId) => renderNodeById(childId, path));
  }

  return <>{renderNodeById(spec.root, new Set())}</>;
}

export function LiquidUi({ spec }: LiquidUiProps) {
  const renderableSpec = toRenderableSpec(spec);

  if (!renderableSpec) return null;

  return (
    <LiquidUiErrorBoundary>
      <div className="my-3 w-full min-w-0 border-t border-border/40 pt-3">
        <LiquidUiTree spec={renderableSpec} />
      </div>
    </LiquidUiErrorBoundary>
  );
}
