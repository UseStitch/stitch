import { useEffect, useRef } from 'react';

export type InfiniteLoadObserverOptions = {
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  threshold?: number;
};

/**
 * Observes a sentinel element with an IntersectionObserver and calls
 * onLoadMore when it becomes visible, guarding against re-triggering
 * while a fetch is already in flight or there's nothing left to load.
 */
export function watchInfiniteLoad(node: Element, options: InfiniteLoadObserverOptions): () => void {
  const { hasMore, isLoading, onLoadMore, threshold } = options;
  if (!hasMore || isLoading) return () => {};

  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.at(0)?.isIntersecting) onLoadMore();
    },
    threshold === undefined ? undefined : { threshold },
  );

  observer.observe(node);
  return () => observer.disconnect();
}

/**
 * Returns a ref to attach to a sentinel element. When that element
 * intersects the viewport, onLoadMore fires, as long as hasMore is
 * true and isLoading is false.
 */
export function useInfiniteLoadObserver(options: InfiniteLoadObserverOptions): React.RefObject<HTMLDivElement | null> {
  const { hasMore, isLoading, onLoadMore, threshold } = options;
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    return watchInfiniteLoad(node, { hasMore, isLoading, onLoadMore, threshold });
  }, [hasMore, isLoading, onLoadMore, threshold]);

  return sentinelRef;
}
