import * as React from 'react';

import { MaskedIcon } from '@/components/icons/masked-icon';
import { useServerAssetUrl } from '@/components/icons/use-server-asset-url';
import { cn } from '@/lib/utils';

const resolvedImageCache = new Map<string, boolean>();

function useResolvedImageUrl(url: string | null): string | null {
  const [resolvedUrl, setResolvedUrl] = React.useState<string | null>(() => {
    if (!url) return null;
    return resolvedImageCache.get(url) === true ? url : null;
  });
  const [failed, setFailed] = React.useState(() => (url ? resolvedImageCache.get(url) === false : false));

  React.useEffect(() => {
    if (!url) {
      setResolvedUrl(null);
      setFailed(false);
      return;
    }

    const cached = resolvedImageCache.get(url);
    if (cached !== undefined) {
      setResolvedUrl(cached ? url : null);
      setFailed(!cached);
      return;
    }

    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      resolvedImageCache.set(url, true);
      setResolvedUrl(url);
      setFailed(false);
    };
    image.onerror = () => {
      if (!active) return;
      resolvedImageCache.set(url, false);
      setResolvedUrl(null);
      setFailed(true);
    };
    image.src = url;

    return () => {
      active = false;
    };
  }, [url]);

  if (failed) return null;
  return resolvedUrl;
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
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) return <>{fallback}</>;

  return (
    <img
      src={url}
      alt=""
      aria-label={label}
      className={cn('shrink-0 rounded-sm object-contain', className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
