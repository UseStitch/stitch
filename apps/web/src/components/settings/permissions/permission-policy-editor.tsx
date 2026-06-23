import { FolderOpenIcon, Settings2Icon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { ToolPermission, ToolPermissionValue } from '@stitch/shared/permissions/types';
import type { BashPreset } from '@stitch/shared/tools/bash-presets';
import { BASH_COMMON_PRESETS } from '@stitch/shared/tools/bash-presets';

import { PermissionSelect } from './permission-select';

import type { EditingTarget } from './types';
import { SettingSubPage, SettingsIconButtonTooltip } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  toolPermissionsQueryOptions,
  useDeleteToolPermission,
  useUpsertToolPermission,
} from '@/lib/queries/tools';

const FILE_PATTERN_TOOLS = new Set(['read', 'edit', 'write', 'glob', 'grep']);
const COMMAND_PATTERN_TOOLS = new Set(['bash']);
const PATTERN_POLICY_TOOLS = new Set([...FILE_PATTERN_TOOLS, ...COMMAND_PATTERN_TOOLS]);

type PermissionPolicyEditorProps = {
  target: EditingTarget;
  onBack: () => void;
  getEnabled: (scope: 'tool' | 'toolset' | 'mcp_tool', identifier: string) => boolean;
  onToggleEnabled: (
    scope: 'tool' | 'toolset' | 'mcp_tool',
    identifier: string,
    enabled: boolean,
  ) => void;
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
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
  onToggleEnabled: (
    scope: 'tool' | 'toolset' | 'mcp_tool',
    identifier: string,
    enabled: boolean,
  ) => void;
}) {
  const { data: permissions } = useSuspenseQuery(toolPermissionsQueryOptions);
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
    void upsertPermission
      .mutateAsync({ toolName, pattern: null, permission })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to update permission');
      });
  };

  const handlePatternPermissionChange = (rule: ToolPermission, permission: ToolPermissionValue) => {
    void upsertPermission
      .mutateAsync({ toolName, pattern: rule.pattern, permission })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to update permission');
      });
  };

  const handleDeleteRule = (rule: ToolPermission) => {
    void deletePermission.mutateAsync(rule.id).catch((error: unknown) => {
      toast.error(error instanceof Error ? error.message : 'Failed to delete rule');
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
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Failed to add rule');
      });
  };

  const handleBrowse = () => {
    void window.api?.files?.openPath?.().then((paths) => {
      if (!paths || paths.length === 0) return;
      const picked = paths[0];
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Enabled</span>
          <Switch
            checked={getEnabled(enabledScope, toolName)}
            onCheckedChange={(checked) => onToggleEnabled(enabledScope, toolName, checked)}
          />
        </div>
      }
    >
      <div className="space-y-6">
        <Section
          title="Default behavior"
          description="This permission is used when no path or command rule matches."
        >
          <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div>
                <p className="text-sm font-medium">All uses</p>
                <p className="text-xs text-muted-foreground">
                  Choose allow, ask, or deny by default.
                </p>
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
          <Section
            title="Specific rules"
            description="More specific patterns override the default behavior."
          >
            <div className="overflow-hidden rounded-lg border border-border/60">
              <div className="divide-y divide-border/40">
                {patternRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5"
                  >
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {rule.pattern}
                    </p>
                    <PermissionSelect
                      value={rule.permission}
                      onChange={(value) => handlePatternPermissionChange(rule, value)}
                      includeDeny
                      disabled={isMutating}
                    />
                    <SettingsIconButtonTooltip label="Delete rule">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => handleDeleteRule(rule)}
                        disabled={isMutating}
                        aria-label="Delete rule"
                        className="text-muted-foreground/70 hover:text-destructive"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </SettingsIconButtonTooltip>
                  </div>
                ))}
              </div>
            </div>
          </Section>
        )}

        {isPatternTool && toolName === 'bash' && (
          <Section
            title="Common command presets"
            description="Quickly allow common safe command patterns."
          >
            <div className="flex flex-wrap gap-1.5">
              {BASH_COMMON_PRESETS.map((preset: BashPreset) => {
                const existing = patternRules.find((rule) => rule.pattern === preset.pattern);
                return (
                  <button
                    key={preset.pattern}
                    type="button"
                    disabled={isMutating}
                    onClick={() => {
                      if (existing) {
                        handleDeleteRule(existing);
                      } else {
                        void upsertPermission
                          .mutateAsync({
                            toolName,
                            pattern: preset.pattern,
                            permission: 'allow',
                          })
                          .catch((error: unknown) => {
                            toast.error(
                              error instanceof Error ? error.message : 'Failed to add rule',
                            );
                          });
                      }
                    }}
                    className={[
                      'inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-50',
                      existing
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border-border/50 bg-transparent text-muted-foreground hover:border-border hover:text-foreground',
                    ].join(' ')}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {isPatternTool && (
          <Section
            title={isFileTool ? 'Add path rule' : 'Add command rule'}
            description={
              isFileTool
                ? 'Add file and directory patterns that should use a specific permission.'
                : 'Add command patterns that should use a specific permission.'
            }
          >
            <div className="rounded-lg border border-border/60 bg-card/30 p-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Input
                    value={newPattern}
                    onChange={(event) => setNewPattern(event.target.value)}
                    placeholder={isFileTool ? '/path/to/dir/*' : 'git *'}
                    className={isFileTool ? 'pr-8 font-mono text-xs' : 'font-mono text-xs'}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') handleAddRule();
                    }}
                  />
                  {isFileTool && (
                    <SettingsIconButtonTooltip label="Browse for path">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
                        onClick={handleBrowse}
                        aria-label="Browse for path"
                        tabIndex={-1}
                      >
                        <FolderOpenIcon className="size-3.5" />
                      </Button>
                    </SettingsIconButtonTooltip>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <PermissionSelect
                    value={newPermission}
                    onChange={setNewPermission}
                    includeDeny
                    disabled={isMutating}
                  />
                  <Button
                    size="sm"
                    onClick={handleAddRule}
                    disabled={!newPattern.trim() || isMutating}
                  >
                    Add rule
                  </Button>
                </div>
              </div>
            </div>
          </Section>
        )}
      </div>
    </SettingSubPage>
  );
}

export function PermissionPolicyEditor({
  target,
  onBack,
  getEnabled,
  onToggleEnabled,
}: PermissionPolicyEditorProps) {
  const [editingMcpTool, setEditingMcpTool] = React.useState<{
    toolName: string;
    displayName: string;
  } | null>(null);

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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Enabled</span>
          <Switch
            checked={getEnabled('toolset', target.toolsetId)}
            onCheckedChange={(checked) => onToggleEnabled('toolset', target.toolsetId, checked)}
          />
        </div>
      }
    >
      <Section title="Toolset tools" description="Open settings for per-tool permission behavior.">
        <div className="overflow-hidden rounded-lg border border-border/60">
          <div className="divide-y divide-border/40">
            {target.tools.map((tool) => (
              <div
                key={tool.toolName}
                className={
                  hasPerToolToggle
                    ? 'grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2.5'
                    : 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5'
                }
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{tool.displayName}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingMcpTool(tool)}
                  className="h-7 w-20 justify-center text-muted-foreground hover:text-foreground"
                >
                  <Settings2Icon className="size-3.5" />
                  Settings
                </Button>
                {target.perToolEnabledScope
                  ? (() => {
                      const perToolEnabledScope = target.perToolEnabledScope;
                      return (
                        <Switch
                          checked={getEnabled(perToolEnabledScope, tool.toolName)}
                          onCheckedChange={(checked) =>
                            onToggleEnabled(perToolEnabledScope, tool.toolName, checked)
                          }
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
