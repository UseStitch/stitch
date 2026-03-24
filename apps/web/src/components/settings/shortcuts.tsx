import { SearchIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useHotkeyRecorder, formatForDisplay } from '@tanstack/react-hotkeys';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_DEFAULTS, isValidLeaderKeyHotkey } from '@stitch/shared/settings/types';
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
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';
import { cn } from '@/lib/utils';

const BLOCKED_HOTKEYS = ['Mod+C', 'Mod+V', 'Mod+R', 'Mod+M'];
const LEADER_KEY_RECORDING_ID = '__leader-key__';

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

const KBD_CLASS =
  'inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground';

const defaultLeaderKey = SETTINGS_DEFAULTS.find((s) => s.key === 'shortcuts.leaderKey')!.value;

function HotkeyBadge({
  hotkey,
  isSequence,
}: {
  hotkey: string | null;
  isSequence: boolean;
}) {
  if (!hotkey) {
    return <span className="text-sm text-muted-foreground">Unassigned</span>;
  }

  // Handle LEADER+ prefixed hotkeys: show resolved leader key, then arrow, then suffix
  if (hotkey.startsWith('LEADER+')) {
    const suffix = hotkey.slice('LEADER+'.length);
    const suffixDisplayKeys = formatForDisplay(suffix).split('+');

    return (
      <span className="inline-flex items-center gap-1">
        <kbd className={KBD_CLASS}>Leader</kbd>
        <span className="text-xs text-muted-foreground">then</span>
        {suffixDisplayKeys.map((key, i) => (
          <kbd key={`suffix-${i}`} className={KBD_CLASS}>
            {key}
          </kbd>
        ))}
      </span>
    );
  }

  const displayKeys = formatForDisplay(hotkey).split('+');

  if (isSequence) {
    return (
      <span className="inline-flex gap-1">
        {displayKeys.map((key, i) => (
          <kbd key={`first-${i}`} className={KBD_CLASS}>
            {key}
          </kbd>
        ))}
        {displayKeys.map((key, i) => (
          <kbd key={`second-${i}`} className={KBD_CLASS}>
            {key}
          </kbd>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex gap-1">
      {displayKeys.map((key, i) => (
        <kbd key={i} className={KBD_CLASS}>
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
  const isLeaderShortcut = entry.hotkey?.startsWith('LEADER+');

  return (
    <div className="flex items-center justify-between border-b border-border/50 py-3 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm">{entry.label}</span>
        {!isDefault && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            custom
          </span>
        )}
      </div>
      <button
        onClick={() => !isLeaderShortcut && onStartRecording(entry.actionId)}
        className={cn(
          'text-sm rounded px-2 py-1 transition-colors min-w-30 text-right',
          isLeaderShortcut
            ? 'cursor-default'
            : isRecording
              ? 'text-foreground bg-accent ring-1 ring-ring'
              : conflict
                ? 'text-destructive'
                : 'hover:bg-accent/50 cursor-pointer',
        )}
      >
        {isRecording ? (
          <span className="text-muted-foreground italic">Press keys...</span>
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
  const queryClient = useQueryClient();
  const { data: shortcuts } = useSuspenseQuery(shortcutsQueryOptions);
  const { data: settings } = useSuspenseQuery(settingsQueryOptions);
  const saveShortcut = useSaveShortcut();
  const deleteShortcut = useDeleteShortcut();
  const resetAll = useResetAllShortcuts();
  const saveLeaderKey = useMutation(
    saveSettingMutationOptions('shortcuts.leaderKey', queryClient, { silent: true }),
  );

  const leaderKey = settings['shortcuts.leaderKey'] || defaultLeaderKey;

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

      if (recordingId === LEADER_KEY_RECORDING_ID) {
        if (!isValidLeaderKeyHotkey(hotkey)) {
          toast.error('Leader key must be in the format Mod+<single letter or digit>');
          setRecordingId(null);
          return;
        }

        const conflictEntry = shortcuts.find((entry) => !entry.isSequence && entry.hotkey === hotkey);

        if (conflictEntry) {
          toast.error(
            `${formatForDisplay(hotkey)} is already assigned to "${conflictEntry.label}". Choose a different leader key.`,
          );
          setRecordingId(null);
          return;
        }

        saveLeaderKey.mutate(hotkey);
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
      if (recordingId === LEADER_KEY_RECORDING_ID) {
        toast.error('Leader key cannot be unassigned');
        setRecordingId(null);
        return;
      }

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

  function handleStartLeaderKeyRecording() {
    setRecordingId(LEADER_KEY_RECORDING_ID);
    recorder.startRecording();
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase();
    return q ? shortcuts.filter((e) => e.label.toLowerCase().includes(q)) : shortcuts;
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
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search shortcuts"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => resetAll.mutate()}
          disabled={resetAll.isPending}
        >
          Reset to defaults
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm">Leader key</p>
          <p className="text-xs text-muted-foreground">Used as the prefix for LEADER+ shortcuts</p>
        </div>
        <button
          onClick={handleStartLeaderKeyRecording}
          className={cn(
            'text-sm rounded px-2 py-1 transition-colors min-w-30 text-right hover:bg-accent/50 cursor-pointer',
            recordingId === LEADER_KEY_RECORDING_ID && 'text-foreground bg-accent ring-1 ring-ring',
          )}
        >
          {recordingId === LEADER_KEY_RECORDING_ID ? (
            <span className="text-muted-foreground italic">Press keys...</span>
          ) : (
            <HotkeyBadge hotkey={leaderKey} isSequence={false} />
          )}
        </button>
      </div>

      {groups.size === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">No shortcuts found</p>
      )}

      {Array.from(groups.entries()).map(([category, entries]) => (
        <div key={category}>
          <h3 className="mb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
            {category}
          </h3>
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
        <p className="text-center text-xs text-muted-foreground">
          {recordingId === LEADER_KEY_RECORDING_ID
            ? 'Press Escape to cancel'
            : 'Press Escape to cancel · Backspace to unassign'}
        </p>
      )}
    </div>
  );
}

export function ShortcutsSettings() {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-6">
        <h2 className="text-base font-bold">Keyboard shortcuts</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Customize keyboard shortcuts for quick actions
        </p>
      </div>
      <React.Suspense fallback={<div className="text-sm text-muted-foreground">Loading...</div>}>
        <ShortcutsContent />
      </React.Suspense>
    </div>
  );
}
