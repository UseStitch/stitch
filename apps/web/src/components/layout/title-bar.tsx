import { MacTitleBar } from '@/components/layout/mac-title-bar';
import { WindowsTitleBar } from '@/components/layout/windows-title-bar';

export function TitleBar() {
  const isMac = window.electron?.platform === 'darwin';

  return isMac ? <MacTitleBar /> : <WindowsTitleBar />;
}
