import { useEffect, useState } from 'react';

export function useFullScreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    void window.api.window.isFullScreen().then(setIsFullScreen);

    const unsubscribe = window.electron?.subscribe('window:fullscreen-changed', (value) => {
      setIsFullScreen(value as boolean);
    });

    return () => unsubscribe?.();
  }, []);

  return isFullScreen;
}
