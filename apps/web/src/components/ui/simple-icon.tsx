import { BoxIcon } from 'lucide-react';
import * as React from 'react';

import { getServerUrl, getServerUrlSync } from '@/lib/api';
import { cn } from '@/lib/utils';

type SimpleIconProps = {
  slug: string;
  className?: string;
  fallback?: React.ReactNode;
};

const resolvedCache = new Map<string, string | null>();

export function SimpleIcon({ slug, className, fallback }: SimpleIconProps) {
  const initialBaseUrl = getServerUrlSync();
  const initialCacheKey = initialBaseUrl ? `${initialBaseUrl}:${slug}` : null;
  const initialCached = initialCacheKey ? resolvedCache.get(initialCacheKey) : undefined;

  const [baseUrl, setBaseUrl] = React.useState<string | null>(initialBaseUrl);
  const [resolvedUrl, setResolvedUrl] = React.useState<string | null>(
    initialCached !== undefined ? initialCached : null,
  );
  const [failed, setFailed] = React.useState(initialCached === null);

  React.useEffect(() => {
    if (baseUrl) return;
    let active = true;
    void getServerUrl().then((url) => {
      if (active) setBaseUrl(url);
    });
    return () => {
      active = false;
    };
  }, [baseUrl]);

  React.useEffect(() => {
    if (!baseUrl) return;

    const cacheKey = `${baseUrl}:${slug}`;
    const logoUrl = `${baseUrl}/icons/simple-icons/${slug}`;

    if (resolvedCache.has(cacheKey)) {
      const cached = resolvedCache.get(cacheKey);
      setResolvedUrl(cached ?? null);
      setFailed(cached === null);
      return;
    }

    let active = true;

    const image = new Image();
    image.onload = () => {
      if (!active) return;
      resolvedCache.set(cacheKey, logoUrl);
      setResolvedUrl(logoUrl);
      setFailed(false);
    };
    image.onerror = () => {
      if (!active) return;
      resolvedCache.set(cacheKey, null);
      setResolvedUrl(null);
      setFailed(true);
    };
    image.src = logoUrl;

    return () => {
      active = false;
    };
  }, [baseUrl, slug]);

  if (resolvedUrl && !failed) {
    return (
      <div
        role="img"
        aria-label={slug}
        className={cn('bg-foreground', className)}
        style={{
          WebkitMask: `url(${resolvedUrl}) no-repeat center / contain`,
          mask: `url(${resolvedUrl}) no-repeat center / contain`,
        }}
      />
    );
  }

  if (failed && fallback) {
    return <>{fallback}</>;
  }

  return <BoxIcon className={cn('text-muted-foreground', className)} />;
}
