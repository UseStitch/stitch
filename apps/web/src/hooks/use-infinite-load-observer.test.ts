import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { watchInfiniteLoad } from './use-infinite-load-observer';

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];

  observed: Element | null = null;
  disconnected = false;

  constructor(
    readonly callback: ObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeIntersectionObserver.instances.push(this);
  }

  observe(node: Element): void {
    this.observed = node;
  }

  disconnect(): void {
    this.disconnected = true;
  }

  emit(isIntersecting: boolean): void {
    this.callback([{ isIntersecting }]);
  }
}

const OriginalIntersectionObserver = globalThis.IntersectionObserver;
const node = {} as Element;

beforeEach(() => {
  FakeIntersectionObserver.instances = [];
  globalThis.IntersectionObserver = FakeIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  globalThis.IntersectionObserver = OriginalIntersectionObserver;
});

describe('watchInfiniteLoad', () => {
  it('does not observe when there is nothing left to load', () => {
    const cleanup = watchInfiniteLoad(node, { hasMore: false, isLoading: false, onLoadMore: () => {} });

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    cleanup();
  });

  it('does not observe while a fetch is already in flight', () => {
    const cleanup = watchInfiniteLoad(node, { hasMore: true, isLoading: true, onLoadMore: () => {} });

    expect(FakeIntersectionObserver.instances).toHaveLength(0);
    cleanup();
  });

  it('calls onLoadMore when the sentinel intersects', () => {
    let calls = 0;
    const cleanup = watchInfiniteLoad(node, { hasMore: true, isLoading: false, onLoadMore: () => calls++ });

    const observer = FakeIntersectionObserver.instances[0];
    observer.emit(true);

    expect(calls).toBe(1);
    expect(observer.observed).toBe(node);
    cleanup();
  });

  it('does not call onLoadMore when the sentinel is not intersecting', () => {
    let calls = 0;
    const cleanup = watchInfiniteLoad(node, { hasMore: true, isLoading: false, onLoadMore: () => calls++ });

    FakeIntersectionObserver.instances[0].emit(false);

    expect(calls).toBe(0);
    cleanup();
  });

  it('passes the threshold option through to the observer', () => {
    const cleanup = watchInfiniteLoad(node, { hasMore: true, isLoading: false, onLoadMore: () => {}, threshold: 0.1 });

    expect(FakeIntersectionObserver.instances[0].options).toEqual({ threshold: 0.1 });
    cleanup();
  });

  it('disconnects the observer on cleanup', () => {
    const cleanup = watchInfiniteLoad(node, { hasMore: true, isLoading: false, onLoadMore: () => {} });

    cleanup();

    expect(FakeIntersectionObserver.instances[0].disconnected).toBe(true);
  });
});
