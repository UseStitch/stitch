import { useEffect, useState } from 'react';

export function useFullScreen() {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const checkFullScreen = async () => {
      if (window.api?.window?.isFullScreen) {
        const fullScreen = await window.api.window.isFullScreen();
        setIsFullScreen(fullScreen);
      }
    };
    void checkFullScreen();

    const unsubscribe = window.electron?.on('window:fullscreen-changed', (value) => {
      setIsFullScreen(value as boolean);
    });

    return () => unsubscribe?.();
  }, []);

  return isFullScreen;
}
