import { ArrowLeftIcon, FolderOpenIcon, Trash2Icon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useSuspenseQuery } from '@tanstack/react-query';

import type { ToolPermission, ToolPermissionValue } from '@stitch/shared/permissions/types';
import type { BashPreset } from '@stitch/shared/tools/bash-presets';
import { BASH_COMMON_PRESETS } from '@stitch/shared/tools/bash-presets';

import { PermissionSelect } from './permission-select';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  toolPermissionsQueryOptions,
  useDeleteToolPermission,
  useUpsertToolPermission,
} from '@/lib/queries/tools';

const FILE_PATTERN_TOOLS = new Set(['read', 'edit', 'write', 'glob', 'grep']);
const COMMAND_PATTERN_TOOLS = new Set(['bash']);
export const PATTERN_POLICY_TOOLS = new Set([...FILE_PATTERN_TOOLS, ...COMMAND_PATTERN_TOOLS]);

type PermissionPolicyEditorProps = {
  toolName: string;
  displayName: string;
  onBack: () => void;
};

export function PermissionPolicyEditor({
  toolName,
  displayName,
  onBack,
}: PermissionPolicyEditorProps) {
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
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back to permissions">
          <ArrowLeftIcon className="size-4" />
        </Button>
        <div>
          <p className="text-sm font-semibold">{displayName} permissions</p>
          <p className="text-xs text-muted-foreground">
            Configure when this tool requires approval
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Default behavior</p>
        <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
          <div>
            <p className="text-sm">All uses</p>
            <p className="text-xs text-muted-foreground">Applied when no specific rule matches</p>
          </div>
          <PermissionSelect
            value={globalPermission}
            onChange={handleGlobalChange}
            includeDeny
            disabled={isMutating}
          />
        </div>
      </div>

      {patternRules.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Specific rules</p>
          <div className="overflow-hidden rounded-md border border-border/50">
            {patternRules.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center gap-3 border-b border-border/40 px-3 py-2.5 last:border-b-0"
              >
                <p className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {rule.pattern}
                </p>
                <PermissionSelect
                  value={rule.permission}
                  onChange={(value) => handlePatternPermissionChange(rule, value)}
                  includeDeny
                  disabled={isMutating}
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => handleDeleteRule(rule)}
                  disabled={isMutating}
                  aria-label="Delete rule"
                  className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {toolName === 'bash' && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">Common commands</p>
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
        </div>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {isFileTool ? 'Add path rule' : 'Add command rule'}
        </p>
        <div className="flex gap-2">
          <div className="relative flex-1">
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
            )}
          </div>
          <PermissionSelect
            value={newPermission}
            onChange={setNewPermission}
            includeDeny
            disabled={isMutating}
          />
          <Button size="sm" onClick={handleAddRule} disabled={!newPattern.trim() || isMutating}>
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
