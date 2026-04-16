import * as React from 'react';

import { McpServersContent } from '@/components/settings/mcp-servers/content';

export function McpServersSettings() {
  return (
    <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
      <McpServersContent />
    </React.Suspense>
  );
}
