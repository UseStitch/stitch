import * as React from 'react';

import { AddCustomMcpServer } from './mcp-servers/add-custom-mcp-server';
import { InstallRegistryMcpServer } from './mcp-servers/install-registry-mcp-server';
import { McpRegistryList } from './mcp-servers/mcp-registry-list';
import { McpServerList } from './mcp-servers/mcp-server-list';
import { McpToolsPreview } from './mcp-servers/mcp-tools-preview';

import type { View } from './mcp-servers/shared';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage } from '@/components/settings/settings-ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = 'configured' | 'marketplace';

function McpServersContent() {
  const page = SETTINGS_PAGE_BY_ID['mcp-servers'];
  const Icon = page.icon;
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
      title={page.title}
      description={page.description}
      icon={<Icon className="size-5" />}
    >
      <Tabs
        value={view.tab}
        onValueChange={(tab) => setView({ type: 'home', tab: tab as Tab })}
        className="space-y-4"
      >
        <TabsList variant="line">
          <TabsTrigger value="configured">Configured</TabsTrigger>
          <TabsTrigger value="marketplace">Marketplace</TabsTrigger>
        </TabsList>

        <TabsContent value="configured" className="mt-0">
          <McpServerList
            onAdd={() => setView({ type: 'add-custom', returnTab: 'configured' })}
            onPreview={(server) => setView({ type: 'preview', server, returnTab: 'configured' })}
          />
        </TabsContent>
        <TabsContent value="marketplace" className="mt-0">
          <McpRegistryList
            onAddCustom={() => setView({ type: 'add-custom', returnTab: 'marketplace' })}
            onInstall={(server) => setView({ type: 'install', server, returnTab: 'marketplace' })}
          />
        </TabsContent>
      </Tabs>
    </SettingPage>
  );
}

export function McpServersSettings() {
  return <McpServersContent />;
}
