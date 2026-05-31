import * as React from 'react';

import { getServerUrl, getServerUrlSync } from '@/lib/api';

export function useServerAssetUrl(path: string | null | undefined): string | null {
  const initialBaseUrl = getServerUrlSync();
  const [baseUrl, setBaseUrl] = React.useState<string | null>(initialBaseUrl);

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

  if (!path || !baseUrl) return null;
  return `${baseUrl}${path}`;
}
