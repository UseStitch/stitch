import { SearchIcon } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

import { useHotkeyRecorder, formatForDisplay } from '@tanstack/react-hotkeys';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_DEFAULTS, isValidLeaderKeyHotkey } from '@stitch/shared/settings/types';
import { SHORTCUT_CATEGORIES, SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';

import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection, SettingRows, SettingRow } from '@/components/settings/settings-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';
import {
  shortcutsQueryOptions,
  useSaveShortcut,
  useDeleteShortcut,
  useResetAllShortcuts,
  type ShortcutEntry,
} from '@/lib/queries/shortcuts';
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
  'inline-flex items-center justify-center rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-xs font-semibold text-foreground shadow-sm';

const defaultLeaderKey = SETTINGS_DEFAULTS.find((s) => s.key === 'shortcuts.leaderKey')!.value;

function HotkeyBadge({ hotkey, isSequence }: { hotkey: string | null; isSequence: boolean }) {
  if (!hotkey) {
    return <span className="text-sm font-medium text-muted-foreground/60">Unassigned</span>;
  }

  // Handle LEADER+ prefixed hotkeys: show resolved leader key, then arrow, then suffix
  if (hotkey.startsWith('LEADER+')) {
    const suffix = hotkey.slice('LEADER+'.length);
    const suffixDisplayKeys = formatForDisplay(suffix).split('+');

    return (
      <span className="inline-flex items-center gap-1.5">
        <kbd className={KBD_CLASS}>Leader</kbd>
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">then</span>
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
      <span className="inline-flex gap-1.5">
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
    <span className="inline-flex gap-1.5">
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
    <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5 transition-colors last:border-0 hover:bg-muted/20">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{entry.label}</span>
        {!isDefault && (
          <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-muted-foreground uppercase">
            Custom
          </span>
        )}
      </div>
      <button
        onClick={() => !isLeaderShortcut && onStartRecording(entry.actionId)}
        className={cn(
          'text-sm rounded-md px-2 py-1.5 transition-colors',
          isLeaderShortcut
            ? 'cursor-default'
            : isRecording
              ? 'text-foreground bg-accent shadow-inner ring-1 ring-ring/50'
              : conflict
                ? 'text-destructive'
                : 'hover:bg-accent/60 hover:text-accent-foreground cursor-pointer',
        )}>
        {isRecording ? (
          <span className="text-xs font-medium text-muted-foreground italic">Press keys...</span>
        ) : conflict ? (
          <span className="text-xs font-semibold text-destructive">Conflicts with {conflict}</span>
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
  const saveLeaderKey = useMutation(saveSettingMutationOptions('shortcuts.leaderKey', queryClient, { silent: true }));

  const leaderKey = settings['shortcuts.leaderKey'] || defaultLeaderKey;

  const [search, setSearch] = React.useState('');
  const [recordingId, setRecordingId] = React.useState<string | null>(null);

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      if (!recordingId) return;

      if (BLOCKED_HOTKEYS.includes(hotkey)) {
        toast.error(`${formatForDisplay(hotkey)} is reserved and cannot be used`, { id: 'shortcut-reserved' });
        setRecordingId(null);
        return;
      }

      if (recordingId === LEADER_KEY_RECORDING_ID) {
        if (!isValidLeaderKeyHotkey(hotkey)) {
          toast.error('Leader key must be in the format Mod+<single letter or digit>', {
            id: 'shortcut-leader-format',
          });
          setRecordingId(null);
          return;
        }

        const conflictEntry = shortcuts.find((entry) => !entry.isSequence && entry.hotkey === hotkey);

        if (conflictEntry) {
          toast.error(
            `${formatForDisplay(hotkey)} is already assigned to "${conflictEntry.label}". Choose a different leader key.`,
            { id: 'shortcut-leader-conflict' },
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
          { id: 'shortcut-conflict' },
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
        toast.error('Leader key cannot be unassigned', { id: 'shortcut-leader-unassign' });
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
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="border-border/60 bg-muted/20 pl-9 shadow-inner"
            placeholder="Search shortcuts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 font-medium text-muted-foreground hover:text-foreground"
          onClick={() => resetAll.mutate()}
          disabled={resetAll.isPending}>
          Reset to defaults
        </Button>
      </div>

      <SettingSection title="Leader Key">
        <SettingRows>
          <SettingRow label="Leader key" description="Used as the prefix for LEADER+ shortcuts">
            <button
              onClick={handleStartLeaderKeyRecording}
              className={cn(
                'text-sm rounded-md px-2 py-1.5 transition-colors hover:bg-accent/60 cursor-pointer',
                recordingId === LEADER_KEY_RECORDING_ID && 'text-foreground bg-accent shadow-inner ring-1 ring-ring/50',
              )}>
              {recordingId === LEADER_KEY_RECORDING_ID ? (
                <span className="text-xs font-medium text-muted-foreground italic">Press keys...</span>
              ) : (
                <HotkeyBadge hotkey={leaderKey} isSequence={false} />
              )}
            </button>
          </SettingRow>
        </SettingRows>
      </SettingSection>

      <Tabs defaultValue={SHORTCUT_CATEGORIES[0]} className="gap-4">
        <TabsList variant="line">
          {SHORTCUT_CATEGORIES.map((category) => (
            <TabsTrigger key={category} value={category}>
              {category}
            </TabsTrigger>
          ))}
        </TabsList>

        {SHORTCUT_CATEGORIES.map((category) => {
          const entries = groups.get(category) ?? [];
          return (
            <TabsContent key={category} value={category} className="mt-4">
              {entries.length > 0 ? (
                <SettingRows>
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
                </SettingRows>
              ) : (
                <p className="rounded-xl border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm font-medium text-muted-foreground">
                  No {category.toLowerCase()} shortcuts match "{search}"
                </p>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {recordingId && (
        <p className="pt-4 text-center text-xs font-medium text-muted-foreground">
          {recordingId === LEADER_KEY_RECORDING_ID
            ? 'Press Escape to cancel'
            : 'Press Escape to cancel · Backspace to unassign'}
        </p>
      )}
    </div>
  );
}

export function ShortcutsSettings() {
  const page = SETTINGS_PAGE_BY_ID.shortcuts;
  const Icon = page.icon;

  return (
    <SettingPage title={page.title} description={page.description} icon={<Icon className="size-5" />}>
      <ShortcutsContent />
    </SettingPage>
  );
}
