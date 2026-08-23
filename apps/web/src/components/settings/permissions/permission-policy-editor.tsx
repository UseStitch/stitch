import { FolderOpenIcon, Settings2Icon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { ToolPermission, ToolPermissionValue } from '@stitch/shared/permissions/types';
import type { BashPreset } from '@stitch/shared/tools/bash-presets';
import { BASH_COMMON_PRESETS } from '@stitch/shared/tools/bash-presets';

import { PermissionSelect } from './permission-select';

import type { EditingTarget } from './types';
import { Icon } from '@/components/primitives/icon';
import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SettingSubPage, SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { getErrorMessage } from '@/lib/errors';
import { toolPermissionsQueryOptions, useDeleteToolPermission, useUpsertToolPermission } from '@/lib/queries/tools';

const FILE_PATTERN_TOOLS = new Set(['read', 'edit', 'write', 'glob', 'grep']);
const COMMAND_PATTERN_TOOLS = new Set(['bash']);
const PATTERN_POLICY_TOOLS = new Set([...FILE_PATTERN_TOOLS, ...COMMAND_PATTERN_TOOLS]);

type PermissionPolicyEditorProps = {
  target: EditingTarget;
  onBack: () => void;
  getEnabled: (scope: 'tool' | 'toolset' | 'mcp_tool', identifier: string) => boolean;
  onToggleEnabled: (scope: 'tool' | 'toolset' | 'mcp_tool', identifier: string, enabled: boolean) => void;
};

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="space-y-space-m">
      <div>
        <Text variant="body-strong">{title}</Text>
        <Text variant="caption" tone="muted">
          {description}
        </Text>
      </div>
      {children}
    </section>
  );
}

function ToolPermissionEditor({
  toolName,
  displayName,
  onBack,
  enabledScope,
  getEnabled,
  onToggleEnabled,
}: {
  toolName: string;
  displayName: string;
  onBack: () => void;
  enabledScope: 'tool' | 'toolset' | 'mcp_tool';
  getEnabled: (scope: 'tool' | 'toolset' | 'mcp_tool', identifier: string) => boolean;
  onToggleEnabled: (scope: 'tool' | 'toolset' | 'mcp_tool', identifier: string, enabled: boolean) => void;
}) {
  const { data: permissions } = useSuspenseQuery({ ...toolPermissionsQueryOptions, select: (data) => data });
  const upsertPermission = useUpsertToolPermission();
  const deletePermission = useDeleteToolPermission();

  const [newPattern, setNewPattern] = React.useState('');
  const [newPermission, setNewPermission] = React.useState<ToolPermissionValue>('ask');

  const toolPermissions = permissions.filter((permission) => permission.toolName === toolName);
  const globalRule = toolPermissions.find((permission) => permission.pattern === null);
  const patternRules = toolPermissions.filter((permission) => permission.pattern !== null);
  const globalPermission: ToolPermissionValue = globalRule?.permission ?? 'ask';

  const isFileTool = FILE_PATTERN_TOOLS.has(toolName);
  const isPatternTool = PATTERN_POLICY_TOOLS.has(toolName);
  const isMutating = upsertPermission.isPending || deletePermission.isPending;

  const handleGlobalChange = (permission: ToolPermissionValue) => {
    void upsertPermission.mutateAsync({ toolName, pattern: null, permission }).catch((error: Error) => {
      toast.error(getErrorMessage(error, 'Failed to update permission'), { id: 'permission-update' });
    });
  };

  const handlePatternPermissionChange = (rule: ToolPermission, permission: ToolPermissionValue) => {
    void upsertPermission.mutateAsync({ toolName, pattern: rule.pattern, permission }).catch((error: Error) => {
      toast.error(getErrorMessage(error, 'Failed to update permission'), { id: 'permission-update' });
    });
  };

  const handleDeleteRule = (rule: ToolPermission) => {
    void deletePermission.mutateAsync(rule.id).catch((error: Error) => {
      toast.error(getErrorMessage(error, 'Failed to delete rule'), { id: 'permission-delete' });
    });
  };

  const handleAddRule = () => {
    const pattern = newPattern.trim();
    if (!pattern) return;

    void upsertPermission
      .mutateAsync({ toolName, pattern, permission: newPermission })
      .then(() => {
        setNewPattern('');
        setNewPermission('ask');
      })
      .catch((error: Error) => {
        toast.error(getErrorMessage(error, 'Failed to add rule'), { id: 'permission-add-rule' });
      });
  };

  const handleBrowse = () => {
    void window.api.files.openPath().then((paths) => {
      if (paths.length === 0) return;
      const picked = paths.at(0);
      if (!picked) return;
      const lastSegment = picked.split(/[/\\]/).at(-1) ?? '';
      const isLikelyDir = !lastSegment.includes('.');
      setNewPattern(isLikelyDir ? `${picked}/*` : picked);
    });
  };

  return (
    <SettingSubPage
      title={displayName}
      description={`Tool id: ${toolName}`}
      onBack={onBack}
      backLabel="Back to tools"
      actions={
        <Stack direction="row" align="center" gap="m">
          <Text variant="caption" tone="muted">
            Enabled
          </Text>
          <Switch
            checked={getEnabled(enabledScope, toolName)}
            onCheckedChange={(checked) => onToggleEnabled(enabledScope, toolName, checked)}
          />
        </Stack>
      }>
      <div className="space-y-space-2xl">
        <Section title="Default behavior" description="This permission is used when no path or command rule matches.">
          <div className="rounded-lg border border-border-subtle bg-card px-space-l py-space-m">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-space-l">
              <div>
                <Text variant="body-strong">All uses</Text>
                <Text variant="caption" tone="muted">
                  Choose allow, ask, or deny by default.
                </Text>
              </div>
              <PermissionSelect
                value={globalPermission}
                onChange={handleGlobalChange}
                includeDeny
                disabled={isMutating}
              />
            </div>
          </div>
        </Section>

        {isPatternTool && patternRules.length > 0 && (
          <Section title="Specific rules" description="More specific patterns override the default behavior.">
            <div className="overflow-hidden rounded-lg border border-border-subtle">
              <div className="divide-y divide-border-subtle">
                {patternRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-space-m px-space-l py-space-m">
                    <Text variant="code" tone="muted" truncate>
                      {rule.pattern}
                    </Text>
                    <PermissionSelect
                      value={rule.permission}
                      onChange={(value) => handlePatternPermissionChange(rule, value)}
                      includeDeny
                      disabled={isMutating}
                    />
                    <SettingsIconButtonTooltip label="Delete rule">
                      <Button
                        size="icon-sm"
                        variant="destructive-quiet"
                        onClick={() => handleDeleteRule(rule)}
                        disabled={isMutating}
                        aria-label="Delete rule">
                        <Icon as={Trash2Icon} size="s" />
                      </Button>
                    </SettingsIconButtonTooltip>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {isPatternTool && toolName === 'bash' && (
          <Section title="Common command presets" description="Quickly allow common safe command patterns.">
            <Stack direction="row" gap="s" wrap>
              {BASH_COMMON_PRESETS.map((preset: BashPreset) => {
                const existing = patternRules.find((rule) => rule.pattern === preset.pattern);
                return (
                  <Button
                    key={preset.pattern}
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={isMutating}
                    onClick={() => {
                      if (existing) {
                        handleDeleteRule(existing);
                      } else {
                        void upsertPermission
                          .mutateAsync({ toolName, pattern: preset.pattern, permission: 'allow' })
                          .catch((error: Error) => {
                            toast.error(getErrorMessage(error, 'Failed to add rule'), { id: 'permission-add-preset' });
                          });
                      }
                    }}
                    className={[
                      'h-auto rounded-md border px-space-m py-space-2xs font-mono',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      existing
                        ? 'border-primary-subtle bg-primary-subtle text-primary'
                        : 'border-border-subtle bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
                    ].join(' ')}>
                    {preset.label}
                  </Button>
                );
              })}
            </Stack>
          </Section>
        )}

        {isPatternTool && (
          <Section
            title={isFileTool ? 'Add path rule' : 'Add command rule'}
            description={
              isFileTool
                ? 'Add file and directory patterns that should use a specific permission.'
                : 'Add command patterns that should use a specific permission.'
            }>
            <div className="rounded-lg border border-border-subtle bg-card p-space-l">
              <div className="flex flex-col gap-space-m sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Input
                    value={newPattern}
                    onChange={(event) => setNewPattern(event.target.value)}
                    placeholder={isFileTool ? '/path/to/dir/*' : 'git *'}
                    className={isFileTool ? 'pr-space-3xl font-mono text-xs' : 'font-mono text-xs'}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleAddRule();
                    }}
                  />
                  {isFileTool && (
                    <SettingsIconButtonTooltip label="Browse for path">
                      <Button
                        type="button"
                        variant="quiet"
                        size="icon-sm"
                        className="absolute top-1/2 right-1 -translate-y-1/2"
                        onClick={handleBrowse}
                        aria-label="Browse for path"
                        tabIndex={-1}>
                        <Icon as={FolderOpenIcon} size="s" />
                      </Button>
                    </SettingsIconButtonTooltip>
                  )}
                </div>
                <Stack direction="row" align="center" gap="m">
                  <PermissionSelect
                    value={newPermission}
                    onChange={setNewPermission}
                    includeDeny
                    disabled={isMutating}
                  />
                  <Button size="sm" onClick={handleAddRule} disabled={!newPattern.trim() || isMutating}>
                    Add rule
                  </Button>
                </Stack>
              </div>
            </div>
          </Section>
        )}
      </div>
    </SettingSubPage>
  );
}

export function PermissionPolicyEditor({ target, onBack, getEnabled, onToggleEnabled }: PermissionPolicyEditorProps) {
  const [editingMcpTool, setEditingMcpTool] = React.useState<{ toolName: string; displayName: string } | null>(null);

  if (editingMcpTool) {
    return (
      <ToolPermissionEditor
        toolName={editingMcpTool.toolName}
        displayName={editingMcpTool.displayName}
        onBack={() => setEditingMcpTool(null)}
        enabledScope="mcp_tool"
        getEnabled={getEnabled}
        onToggleEnabled={onToggleEnabled}
      />
    );
  }

  if (target.type === 'tool') {
    return (
      <ToolPermissionEditor
        toolName={target.toolName}
        displayName={target.displayName}
        onBack={onBack}
        enabledScope={target.enabledScope}
        getEnabled={getEnabled}
        onToggleEnabled={onToggleEnabled}
      />
    );
  }

  const hasPerToolToggle = !!target.perToolEnabledScope;

  return (
    <SettingSubPage
      title={target.displayName}
      description={target.subtitle}
      onBack={onBack}
      backLabel="Back to tools"
      actions={
        <Stack direction="row" align="center" gap="m">
          <Text variant="caption" tone="muted">
            Enabled
          </Text>
          <Switch
            checked={getEnabled('toolset', target.toolsetId)}
            onCheckedChange={(checked) => onToggleEnabled('toolset', target.toolsetId, checked)}
          />
        </Stack>
      }>
      <Section title="Toolset tools" description="Open settings for per-tool permission behavior.">
        <div className="overflow-hidden rounded-lg border border-border-subtle">
          <div className="divide-y divide-border-subtle">
            {target.tools.map((tool) => (
              <div
                key={tool.toolName}
                className={
                  hasPerToolToggle
                    ? 'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-space-m px-space-l py-space-m'
                    : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-space-m px-space-l py-space-m'
                }>
                <div className="min-w-0">
                  <Text variant="body-strong" truncate>
                    {tool.displayName}
                  </Text>
                </div>
                <div className="w-20">
                  <Button size="sm" variant="quiet" width="full" onClick={() => setEditingMcpTool(tool)}>
                    <Icon as={Settings2Icon} size="s" />
                    Settings
                  </Button>
                </div>
                {target.perToolEnabledScope
                  ? (() => {
                      const perToolEnabledScope = target.perToolEnabledScope;
                      return (
                        <Switch
                          checked={getEnabled(perToolEnabledScope, tool.toolName)}
                          onCheckedChange={(checked) => onToggleEnabled(perToolEnabledScope, tool.toolName, checked)}
                        />
                      );
                    })()
                  : null}
              </div>
            ))}
          </div>
        </div>
      </Section>
    </SettingSubPage>
  );
}
