import { SearchIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useHotkeyRecorder, formatForDisplay } from '@tanstack/react-hotkeys';
import { useSuspenseQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  shortcutsQueryOptions,
  useSaveShortcut,
  useDeleteShortcut,
  useResetAllShortcuts,
} from '@/lib/queries/shortcuts';
import { SHORTCUT_DEFINITIONS, type ShortcutDefinition } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

const BLOCKED_HOTKEYS = ['Mod+C', 'Mod+V', 'Mod+R'];

function resolveHotkey(
  def: ShortcutDefinition,
  overrides: Record<string, string | null>,
): string | null {
  return def.id in overrides ? overrides[def.id]! : def.defaultHotkey;
}

function groupByCategory(defs: ShortcutDefinition[]): Map<string, ShortcutDefinition[]> {
  const groups = new Map<string, ShortcutDefinition[]>();
  for (const def of defs) {
    const existing = groups.get(def.category) ?? [];
    existing.push(def);
    groups.set(def.category, existing);
  }
  return groups;
}

function HotkeyBadge({ hotkey }: { hotkey: string | null }) {
  if (!hotkey) {
    return <span className="text-muted-foreground text-sm">Unassigned</span>;
  }
  return (
    <span className="inline-flex gap-1">
      {formatForDisplay(hotkey)
        .split('+')
        .map((key, i) => (
          <kbd
            key={i}
            className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
          >
            {key}
          </kbd>
        ))}
    </span>
  );
}

function ShortcutRow({
  def,
  currentHotkey,
  isDefault,
  conflict,
  recordingId,
  onStartRecording,
}: {
  def: ShortcutDefinition;
  currentHotkey: string | null;
  isDefault: boolean;
  conflict: string | null;
  recordingId: string | null;
  onStartRecording: (id: string) => void;
}) {
  const isRecording = recordingId === def.id;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm">{def.label}</span>
        {!isDefault && (
          <span className="text-xs text-muted-foreground rounded bg-muted px-1.5 py-0.5">
            custom
          </span>
        )}
      </div>
      <button
        onClick={() => onStartRecording(def.id)}
        className={cn(
          'text-sm rounded px-2 py-1 transition-colors min-w-30 text-right',
          isRecording
            ? 'text-foreground bg-accent ring-1 ring-ring'
            : conflict
              ? 'text-destructive'
              : 'hover:bg-accent/50 cursor-pointer',
        )}
      >
        {isRecording ? (
          <span className="text-muted-foreground italic">Press keys…</span>
        ) : conflict ? (
          <span className="text-xs text-destructive">Conflicts with {conflict}</span>
        ) : (
          <HotkeyBadge hotkey={currentHotkey} />
        )}
      </button>
    </div>
  );
}

function ShortcutsContent() {
  const { data: overrides } = useSuspenseQuery(shortcutsQueryOptions);
  const saveShortcut = useSaveShortcut();
  const deleteShortcut = useDeleteShortcut();
  const resetAll = useResetAllShortcuts();

  const [search, setSearch] = React.useState('');
  const [recordingId, setRecordingId] = React.useState<string | null>(null);

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      if (!recordingId) return;

      if (BLOCKED_HOTKEYS.includes(hotkey)) {
        toast.error(`${formatForDisplay(hotkey)} is reserved and cannot be used`);
        setRecordingId(null);
        return;
      }

      // Check for conflicts with other shortcuts
      const conflictDef = SHORTCUT_DEFINITIONS.find((def) => {
        if (def.id === recordingId) return false;
        return resolveHotkey(def, overrides) === hotkey;
      });

      if (conflictDef) {
        toast.error(
          `${formatForDisplay(hotkey)} is already assigned to "${conflictDef.label}". Please unassign it first.`,
        );
        setRecordingId(null);
        return;
      }

      saveShortcut.mutate({ actionId: recordingId, hotkey });
      setRecordingId(null);
    },
    onCancel: () => setRecordingId(null),
    onClear: () => {
      if (recordingId) {
        deleteShortcut.mutate(recordingId);
        setRecordingId(null);
      }
    },
  });

  function handleStartRecording(id: string) {
    setRecordingId(id);
    recorder.startRecording();
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? SHORTCUT_DEFINITIONS.filter((d) => d.label.toLowerCase().includes(q))
      : SHORTCUT_DEFINITIONS;
  }, [search]);

  const groups = React.useMemo(() => groupByCategory(filtered), [filtered]);

  const conflicts = React.useMemo(() => {
    const map = new Map<string, string>();
    const hotkeyToDef = new Map<string, ShortcutDefinition>();
    for (const def of SHORTCUT_DEFINITIONS) {
      const hotkey = resolveHotkey(def, overrides);
      if (hotkey) {
        if (hotkeyToDef.has(hotkey)) {
          map.set(def.id, hotkeyToDef.get(hotkey)!.label);
          map.set(hotkeyToDef.get(hotkey)!.id, def.label);
        } else {
          hotkeyToDef.set(hotkey, def);
        }
      }
    }
    return map;
  }, [overrides]);

  return (
    <div className="flex flex-col gap-4">
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Search shortcuts"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {groups.size === 0 && (
        <p className="text-muted-foreground text-sm text-center py-4">No shortcuts found</p>
      )}

      {Array.from(groups.entries()).map(([category, defs]) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{category}</h3>
          <div>
            {defs.map((def) => {
              const currentHotkey = resolveHotkey(def, overrides);
              const isDefault = currentHotkey === def.defaultHotkey;
              return (
                <ShortcutRow
                  key={def.id}
                  def={def}
                  currentHotkey={currentHotkey}
                  isDefault={isDefault}
                  conflict={conflicts.get(def.id) ?? null}
                  recordingId={recordingId}
                  onStartRecording={handleStartRecording}
                />
              );
            })}
          </div>
        </div>
      ))}

      {recordingId && (
        <p className="text-xs text-muted-foreground text-center">
          Press Escape to cancel · Backspace to unassign
        </p>
      )}

      <Button
        variant="ghost"
        size="sm"
        className="self-end text-muted-foreground"
        onClick={() => resetAll.mutate()}
        disabled={resetAll.isPending}
      >
        Reset to defaults
      </Button>
    </div>
  );
}

export function ShortcutsSettings() {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-6">
        <h2 className="text-base font-bold">Keyboard shortcuts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Customize keyboard shortcuts for quick actions
        </p>
      </div>
      <React.Suspense fallback={<div className="text-muted-foreground text-sm">Loading...</div>}>
        <ShortcutsContent />
      </React.Suspense>
    </div>
  );
}
