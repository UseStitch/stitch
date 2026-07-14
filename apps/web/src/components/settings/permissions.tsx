import * as React from 'react';
import { toast } from 'sonner';

import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_SCHEMAS } from '@stitch/shared/settings/types';

import { PermissionPolicyEditor } from './permissions/permission-policy-editor';

import { ConnectorIcon } from '@/components/connectors/connector-icon';
import { EmptyState, SectionCard, ToolRow, ToolsetRow } from '@/components/settings/permissions/components';
import { filterCoreTools, filterToolsetsByQuery } from '@/components/settings/permissions/filtering';
import { McpToolsTab, filterMcpGroups, useMcpToolsetGroups } from '@/components/settings/permissions/mcp-tools-tab';
import type { EditingTarget } from '@/components/settings/permissions/types';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import {
  NumberSettingRow,
  SettingPage,
  SettingRow,
  SettingRowControl,
  SettingRows,
  SettingSection,
} from '@/components/settings/settings-ui';
import { NativeToolsetIcon, ToolNameIcon } from '@/components/tools/tool-icons';
import { SearchInput } from '@/components/ui/search-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getErrorMessage } from '@/lib/errors';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';
import {
  knownMcpToolsQueryOptions,
  knownToolsetsQueryOptions,
  knownToolsQueryOptions,
  toolEnabledStatesQueryOptions,
  useSetToolEnabledState,
} from '@/lib/queries/tools';

type ScopeFilter = 'stitch' | 'native' | 'connectors' | 'mcp' | 'settings';
type ToolsetDefaultScope = 'current_run' | 'ttl_turns' | 'until_deactivated';

const DEFAULT_TOOLSET_SCOPE = 'ttl_turns' satisfies ToolsetDefaultScope;

const TOOLSET_SCOPE_OPTIONS: Array<{ value: ToolsetDefaultScope; label: string }> = [
  { value: 'current_run', label: 'Current run' },
  { value: 'ttl_turns', label: 'TTL turns' },
  { value: 'until_deactivated', label: 'Until deactivated' },
];

function ToolsetActivationSettings() {
  const queryClient = useQueryClient();
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const saveDefaultScope = useMutation(
    saveSettingMutationOptions('toolsets.defaultScope', queryClient, { silent: true }),
  );
  const parsedDefaultScope = SETTINGS_SCHEMAS['toolsets.defaultScope'].safeParse(settings['toolsets.defaultScope']);
  const defaultScope = parsedDefaultScope.success
    ? (parsedDefaultScope.data as ToolsetDefaultScope)
    : DEFAULT_TOOLSET_SCOPE;
  const selectedScopeLabel =
    TOOLSET_SCOPE_OPTIONS.find((option) => option.value === defaultScope)?.label ?? 'TTL turns';

  return (
    <SettingSection
      title="Toolset activation"
      description="Control how long activated toolsets stay available across conversation turns.">
      <SettingRows>
        <SettingRow label="Default scope" description="Scope used when activate_toolset does not request a lifetime.">
          <SettingRowControl>
            <Select
              value={defaultScope}
              onValueChange={(value) => {
                if (value) saveDefaultScope.mutate(value);
              }}>
              <SelectTrigger className="w-full">
                <SelectValue>{selectedScopeLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {TOOLSET_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRowControl>
        </SettingRow>
        <NumberSettingRow
          settingKey="toolsets.ttlTurns"
          label="TTL turns"
          description="Turns of inactivity before a TTL-scoped toolset expires."
          currentValue={settings['toolsets.ttlTurns'] ?? '3'}
          min={1}
          max={30}
        />
      </SettingRows>
    </SettingSection>
  );
}

function ToolsContent() {
  const page = SETTINGS_PAGE_BY_ID.tools;
  const Icon = page.icon;
  const { data: knownTools } = useSuspenseQuery(knownToolsQueryOptions);
  const { data: knownMcpTools } = useSuspenseQuery(knownMcpToolsQueryOptions);
  const { data: knownToolsets } = useSuspenseQuery(knownToolsetsQueryOptions);
  const { data: enabledStates } = useSuspenseQuery(toolEnabledStatesQueryOptions);
  const setToolEnabledState = useSetToolEnabledState();

  const [search, setSearch] = React.useState('');
  const [scope, setScope] = React.useState<ScopeFilter>('stitch');
  const [editingTarget, setEditingTarget] = React.useState<EditingTarget | null>(null);

  const mcpToolMetaByName = React.useMemo(() => {
    return new Map(
      knownMcpTools.map((tool) => [
        tool.name,
        {
          serverId: tool.serverId,
          serverName: tool.serverName,
          serverIconPath: tool.serverIconPath,
          toolIconPath: tool.toolIconPath,
        },
      ]),
    );
  }, [knownMcpTools]);

  const enabledMap = React.useMemo(() => {
    return new Map(enabledStates.map((state) => [`${state.scope}:${state.identifier}`, state.enabled]));
  }, [enabledStates]);

  const getEnabled = React.useCallback(
    (kind: 'tool' | 'toolset' | 'mcp_tool', identifier: string) => {
      return enabledMap.get(`${kind}:${identifier}`) ?? true;
    },
    [enabledMap],
  );

  const updateEnabled = React.useCallback(
    (kind: 'tool' | 'toolset' | 'mcp_tool', identifier: string, enabled: boolean) => {
      void setToolEnabledState.mutateAsync({ scope: kind, identifier, enabled }).catch((error: unknown) => {
        toast.error(getErrorMessage(error, 'Failed to update tool state'), { id: 'tool-state' });
      });
    },
    [setToolEnabledState],
  );

  const query = search.trim().toLowerCase();
  const stitchTools = filterCoreTools(knownTools, query);
  const filteredToolsets = filterToolsetsByQuery(knownToolsets, query);
  const nativeToolsets = filteredToolsets.filter((toolset) => toolset.source === 'native');
  const connectorToolsets = filteredToolsets.filter((toolset) => toolset.source === 'connector');

  const mcpToolsetGroups = useMcpToolsetGroups(knownTools, mcpToolMetaByName);
  const filteredMcpGroups = React.useMemo(() => filterMcpGroups(mcpToolsetGroups, query), [mcpToolsetGroups, query]);

  if (editingTarget) {
    return (
      <PermissionPolicyEditor
        target={editingTarget}
        onBack={() => setEditingTarget(null)}
        getEnabled={getEnabled}
        onToggleEnabled={updateEnabled}
      />
    );
  }

  const isMutating = setToolEnabledState.isPending;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <div className="space-y-5">
        {scope !== 'settings' && (
          <div>
            <SearchInput
              placeholder="Search by tool, toolset, or MCP server..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        )}

        <Tabs value={scope} onValueChange={(value) => setScope(value as ScopeFilter)} className="space-y-4">
          <TabsList variant="line">
            <TabsTrigger value="stitch">Core tools</TabsTrigger>
            <TabsTrigger value="native">Native toolsets</TabsTrigger>
            <TabsTrigger value="connectors">Connector tools</TabsTrigger>
            <TabsTrigger value="mcp">MCP servers</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="stitch">
            {stitchTools.length > 0 ? (
              <SectionCard
                title="Core tools"
                description="Built-in tools provided by Stitch"
                count={stitchTools.length}>
                <div className="divide-y divide-border/40">
                  {stitchTools.map((tool) => (
                    <ToolRow
                      key={tool.toolName}
                      name={tool.displayName}
                      icon={<ToolNameIcon toolName={tool.toolName} className="size-4 shrink-0 text-muted-foreground" />}
                      technicalName={tool.toolName}
                      enabled={getEnabled('tool', tool.toolName)}
                      onConfigure={() =>
                        setEditingTarget({
                          type: 'tool',
                          toolName: tool.toolName,
                          displayName: tool.displayName,
                          enabledScope: 'tool',
                        })
                      }
                      onToggleEnabled={(checked) => updateEnabled('tool', tool.toolName, checked)}
                      isMutating={isMutating}
                    />
                  ))}
                </div>
              </SectionCard>
            ) : (
              <EmptyState />
            )}
          </TabsContent>

          <TabsContent value="native">
            {nativeToolsets.length > 0 ? (
              <SectionCard
                title="Native toolsets"
                description="Built-in toolsets available in Stitch"
                count={nativeToolsets.length}>
                <div className="divide-y divide-border/40">
                  {nativeToolsets.map((toolset) => (
                    <ToolsetRow
                      key={toolset.id}
                      name={toolset.name}
                      description={toolset.description}
                      icon={
                        <NativeToolsetIcon toolsetId={toolset.id} className="size-4 shrink-0 text-muted-foreground" />
                      }
                      enabled={getEnabled('toolset', toolset.id)}
                      settingsAlign="end"
                      onConfigure={() =>
                        setEditingTarget({
                          type: 'toolset',
                          toolsetId: toolset.id,
                          displayName: toolset.name,
                          subtitle: 'Native toolset',
                          tools: toolset.tools,
                        })
                      }
                      onToggleEnabled={(checked) => updateEnabled('toolset', toolset.id, checked)}
                      isMutating={isMutating}
                    />
                  ))}
                </div>
              </SectionCard>
            ) : (
              <EmptyState />
            )}
          </TabsContent>

          <TabsContent value="connectors">
            {connectorToolsets.length > 0 ? (
              <SectionCard
                title="Connector tools"
                description="Toolsets from connected apps like Google Workspace"
                count={connectorToolsets.length}>
                <div className="divide-y divide-border/40">
                  {connectorToolsets.map((toolset) => (
                    <ToolsetRow
                      key={toolset.id}
                      name={toolset.name}
                      description={toolset.description}
                      icon={
                        toolset.icon ? (
                          <ConnectorIcon icon={toolset.icon} className="size-4 shrink-0 text-muted-foreground" />
                        ) : undefined
                      }
                      enabled={getEnabled('toolset', toolset.id)}
                      settingsAlign="end"
                      onConfigure={() =>
                        setEditingTarget({
                          type: 'toolset',
                          toolsetId: toolset.id,
                          displayName: toolset.name,
                          subtitle: 'Connector toolset',
                          tools: toolset.tools,
                        })
                      }
                      onToggleEnabled={(checked) => updateEnabled('toolset', toolset.id, checked)}
                      isMutating={isMutating}
                    />
                  ))}
                </div>
              </SectionCard>
            ) : (
              <EmptyState />
            )}
          </TabsContent>

          <TabsContent value="mcp">
            <McpToolsTab
              groups={filteredMcpGroups}
              getEnabled={getEnabled}
              updateEnabled={updateEnabled}
              isMutating={isMutating}
              onEditTarget={setEditingTarget}
            />
          </TabsContent>

          <TabsContent value="settings">
            <ToolsetActivationSettings />
          </TabsContent>
        </Tabs>

        <p className="text-xs text-muted-foreground">
          Tip: use <span className="font-medium text-foreground">Settings</span> to configure ask, allow, deny, and
          path/command rules.
        </p>
      </div>
    </SettingPage>
  );
}

export function ToolsSettings() {
  return <ToolsContent />;
}
