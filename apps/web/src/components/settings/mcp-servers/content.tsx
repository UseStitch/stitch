import * as React from 'react';

import { Button } from '@/components/ui/button';

import { AddCustomMcpServer } from './add-custom-mcp-server';
import { InstallRegistryMcpServer } from './install-registry-mcp-server';
import { McpRegistryList } from './mcp-registry-list';
import { McpServerList } from './mcp-server-list';
import { McpToolsPreview } from './mcp-tools-preview';
import type { View } from './shared';

export function McpServersContent() {
  const [view, setView] = React.useState<View>({ type: 'home', tab: 'configured' });

  if (view.type === 'add-custom') {
    return <AddCustomMcpServer onBack={() => setView({ type: 'home', tab: view.returnTab })} />;
  }

  if (view.type === 'preview') {
    return (
      <McpToolsPreview
        server={view.server}
        onBack={() => setView({ type: 'home', tab: view.returnTab })}
      />
    );
  }

  if (view.type === 'install') {
    return (
      <InstallRegistryMcpServer
        server={view.server}
        onBack={() => setView({ type: 'home', tab: view.returnTab })}
        onInstalled={() => setView({ type: 'home', tab: 'configured' })}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center rounded-md border border-border/60 p-1">
        <Button
          variant={view.tab === 'configured' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setView({ type: 'home', tab: 'configured' })}
        >
          Configured
        </Button>
        <Button
          variant={view.tab === 'marketplace' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => setView({ type: 'home', tab: 'marketplace' })}
        >
          Marketplace
        </Button>
      </div>

      {view.tab === 'configured' ? (
        <McpServerList
          onAdd={() => setView({ type: 'add-custom', returnTab: 'configured' })}
          onPreview={(server) => setView({ type: 'preview', server, returnTab: 'configured' })}
        />
      ) : (
        <McpRegistryList
          onAddCustom={() => setView({ type: 'add-custom', returnTab: 'marketplace' })}
          onInstall={(server) => setView({ type: 'install', server, returnTab: 'marketplace' })}
        />
      )}
    </div>
  );
}
