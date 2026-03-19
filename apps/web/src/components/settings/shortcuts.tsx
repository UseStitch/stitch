import { SearchIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useHotkeyRecorder, formatForDisplay } from '@tanstack/react-hotkeys';
import { useSuspenseQuery } from '@tanstack/react-query';

import { SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  shortcutsQueryOptions,
  useSaveShortcut,
  useDeleteShortcut,
  useResetAllShortcuts,
  type ShortcutEntry,
} from '@/lib/queries/shortcuts';
import { cn } from '@/lib/utils';

const BLOCKED_HOTKEYS = ['Mod+C', 'Mod+V', 'Mod+R'];

const defaultsByActionId = new Map<string, (typeof SHORTCUT_DEFAULTS)[number]>(
  SHORTCUT_DEFAULTS.map((d) => [d.actionId, d]),
);

function isDefaultHotkey(entry: ShortcutEntry): boolean {
  const def = defaultsByActionId.get(entry.actionId);
  return def ? entry.hotkey === def.hotkey : true;
}

function groupByCategory(entries: ShortcutEntry[]): Map<string, ShortcutEntry[]> {
  const groups = new Map<string, ShortcutEntry[]>();
  for (const entry of entries) {
    const existing = groups.get(entry.category) ?? [];
    existing.push(entry);
    groups.set(entry.category, existing);
  }
  return groups;
}

function HotkeyBadge({ hotkey, isSequence }: { hotkey: string | null; isSequence: boolean }) {
  if (!hotkey) {
    return <span className="text-muted-foreground text-sm">Unassigned</span>;
  }

  const displayKeys = formatForDisplay(hotkey).split('+');

  if (isSequence) {
    return (
      <span className="inline-flex gap-1">
        {displayKeys.map((key, i) => (
          <kbd
            key={`first-${i}`}
            className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
          >
            {key}
          </kbd>
        ))}
        {displayKeys.map((key, i) => (
          <kbd
            key={`second-${i}`}
            className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
          >
            {key}
          </kbd>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex gap-1">
      {displayKeys.map((key, i) => (
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
  entry,
  isDefault,
  conflict,
  recordingId,
  onStartRecording,
}: {
  entry: ShortcutEntry;
  isDefault: boolean;
  conflict: string | null;
  recordingId: string | null;
  onStartRecording: (id: string) => void;
}) {
  const isRecording = recordingId === entry.actionId;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm">{entry.label}</span>
        {!isDefault && (
          <span className="text-xs text-muted-foreground rounded bg-muted px-1.5 py-0.5">
            custom
          </span>
        )}
      </div>
      <button
        onClick={() => onStartRecording(entry.actionId)}
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
          <HotkeyBadge hotkey={entry.hotkey} isSequence={entry.isSequence} />
        )}
      </button>
    </div>
  );
}

function ShortcutsContent() {
  const { data: shortcuts } = useSuspenseQuery(shortcutsQueryOptions);
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

      const recordingEntry = shortcuts.find((e) => e.actionId === recordingId);

      // Check for conflicts — only conflict if both are the same type (sequence vs single)
      const conflictEntry = shortcuts.find((entry) => {
        if (entry.actionId === recordingId) return false;
        if (entry.hotkey !== hotkey) return false;
        return entry.isSequence === (recordingEntry?.isSequence ?? false);
      });

      if (conflictEntry) {
        toast.error(
          `${formatForDisplay(hotkey)} is already assigned to "${conflictEntry.label}". Please unassign it first.`,
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
      ? shortcuts.filter((e) => e.label.toLowerCase().includes(q))
      : shortcuts;
  }, [search, shortcuts]);

  const groups = React.useMemo(() => groupByCategory(filtered), [filtered]);

  const conflicts = React.useMemo(() => {
    const map = new Map<string, string>();
    const hotkeyToDef = new Map<string, ShortcutEntry>();
    for (const entry of shortcuts) {
      if (!entry.hotkey) continue;
      // Use hotkey + isSequence as the conflict key so single-press and double-press don't clash
      const conflictKey = `${entry.hotkey}:${entry.isSequence}`;
      if (hotkeyToDef.has(conflictKey)) {
        map.set(entry.actionId, hotkeyToDef.get(conflictKey)!.label);
        map.set(hotkeyToDef.get(conflictKey)!.actionId, entry.label);
      } else {
        hotkeyToDef.set(conflictKey, entry);
      }
    }
    return map;
  }, [shortcuts]);

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

      {Array.from(groups.entries()).map(([category, entries]) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{category}</h3>
          <div>
            {entries.map((entry) => (
              <ShortcutRow
                key={entry.actionId}
                entry={entry}
                isDefault={isDefaultHotkey(entry)}
                conflict={conflicts.get(entry.actionId) ?? null}
                recordingId={recordingId}
                onStartRecording={handleStartRecording}
              />
            ))}
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
