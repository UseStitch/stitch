import { useEffect, useState } from 'react';
import { z } from 'zod';

const fullscreenStateSchema = z.boolean();

export function useFullScreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    void window.api.window.isFullScreen().then(setIsFullScreen);

    const unsubscribe = window.electron?.subscribe('window:fullscreen-changed', (value) => {
      const result = fullscreenStateSchema.safeParse(value);
      if (result.success) setIsFullScreen(result.data);
    });

    return () => unsubscribe?.();
  }, []);

  return isFullScreen;
}
