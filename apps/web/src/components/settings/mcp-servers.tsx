import { NetworkIcon } from 'lucide-react';
import * as React from 'react';

import { AddCustomMcpServer } from './mcp-servers/add-custom-mcp-server';
import { InstallRegistryMcpServer } from './mcp-servers/install-registry-mcp-server';
import { McpRegistryList } from './mcp-servers/mcp-registry-list';
import { McpServerList } from './mcp-servers/mcp-server-list';
import { McpToolsPreview } from './mcp-servers/mcp-tools-preview';

import type { View } from './mcp-servers/shared';
import { SettingLoading, SettingPage } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';

type Tab = 'configured' | 'marketplace';

function McpTabSwitcher({ tab, onTabChange }: { tab: Tab; onTabChange: (t: Tab) => void }) {
  return (
    <div className="inline-flex items-center rounded-md border border-border/60 p-1">
      <Button
        variant={tab === 'configured' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => onTabChange('configured')}
      >
        Configured
      </Button>
      <Button
        variant={tab === 'marketplace' ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => onTabChange('marketplace')}
      >
        Marketplace
      </Button>
    </div>
  );
}

function McpServersContent() {
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
    <SettingPage
      title="MCP Servers"
      description="Connect external tools and services via the Model Context Protocol."
      icon={<NetworkIcon className="size-5" />}
      actions={
        <McpTabSwitcher tab={view.tab} onTabChange={(tab) => setView({ type: 'home', tab })} />
      }
    >
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
    </SettingPage>
  );
}

export function McpServersSettings() {
  return (
    <React.Suspense fallback={<SettingLoading />}>
      <McpServersContent />
    </React.Suspense>
  );
}
