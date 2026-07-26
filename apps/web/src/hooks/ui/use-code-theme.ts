import { useSyncExternalStore } from 'react';

import { getCodeTheme, subscribeCodeTheme, type CodeTheme } from '@/lib/theme';

/** Not backed by the settings query, so code blocks render in any tree, provider or not. */
export function useCodeTheme(): CodeTheme {
  return useSyncExternalStore(subscribeCodeTheme, getCodeTheme, getCodeTheme);
}
