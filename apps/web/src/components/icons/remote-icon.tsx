import { cn } from 'cnfast';
import * as React from 'react';

import { MaskedIcon } from '@/components/icons/masked-icon';
import { useServerAssetUrl } from '@/components/icons/use-server-asset-url';

const resolvedImageCache = new Map<string, boolean>();
const resolvedImageListeners = new Set<() => void>();

function subscribeToResolvedImages(listener: () => void) {
  resolvedImageListeners.add(listener);
  return () => {
    resolvedImageListeners.delete(listener);
  };
}

function cacheResolvedImage(url: string, resolved: boolean) {
  resolvedImageCache.set(url, resolved);
  for (const listener of resolvedImageListeners) listener();
}

function useResolvedImageUrl(url: string | null): string | null {
  const resolved = React.useSyncExternalStore(subscribeToResolvedImages, () =>
    url ? resolvedImageCache.get(url) === true : false,
  );

  React.useEffect(() => {
    if (!url || resolvedImageCache.has(url)) return;

    const image = new Image();
    image.onload = () => cacheResolvedImage(url, true);
    image.onerror = () => cacheResolvedImage(url, false);
    image.src = url;
  }, [url]);

  return resolved ? url : null;
}

type RemoteMaskedIconProps = {
  path: string | null | undefined;
  label: string;
  className?: string;
  fallback: React.ReactNode;
};

export function RemoteMaskedIcon({ path, label, className, fallback }: RemoteMaskedIconProps) {
  const url = useServerAssetUrl(path);
  const resolvedUrl = useResolvedImageUrl(url);

  if (!resolvedUrl) return <>{fallback}</>;
  return <MaskedIcon src={resolvedUrl} label={label} className={className} />;
}

type RemoteImageIconProps = {
  path: string | null | undefined;
  label: string;
  className?: string;
  fallback: React.ReactNode;
};

export function RemoteImageIcon({ path, label, className, fallback }: RemoteImageIconProps) {
  const url = useServerAssetUrl(path);
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);

  if (!url || failedUrl === url) return <>{fallback}</>;

  return (
    <img
      src={url}
      alt=""
      aria-label={label}
      className={cn('shrink-0 rounded-sm object-contain', className)}
      loading="lazy"
      onError={() => setFailedUrl(url)}
    />
  );
}
