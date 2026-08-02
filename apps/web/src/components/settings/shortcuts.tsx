import * as React from 'react';
import { toast } from 'sonner';

import { useHotkeyRecorder, formatForDisplay } from '@tanstack/react-hotkeys';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';

import { SETTINGS_DEFAULTS, isValidLeaderKeyHotkey } from '@stitch/shared/settings/types';
import { SHORTCUT_CATEGORIES, SHORTCUT_DEFAULTS } from '@stitch/shared/shortcuts/types';

import { Stack } from '@/components/primitives/stack';
import { Text } from '@/components/primitives/text';
import { SETTINGS_PAGE_BY_ID } from '@/components/settings/settings-metadata';
import { SettingPage, SettingSection, SettingRows, SettingRow } from '@/components/settings/settings-ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription } from '@/components/ui/empty';
import { Kbd } from '@/components/ui/kbd';
import { SearchInput } from '@/components/ui/search-input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { saveSettingMutationOptions, settingsQueryOptions } from '@/lib/queries/settings';
import {
  shortcutsQueryOptions,
  useSaveShortcut,
  useDeleteShortcut,
  useResetAllShortcuts,
  type ShortcutEntry,
} from '@/lib/queries/shortcuts';

const BLOCKED_HOTKEYS = new Set(['Mod+C', 'Mod+V', 'Mod+R', 'Mod+M']);
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

const defaultLeaderKey = SETTINGS_DEFAULTS.find((s) => s.key === 'shortcuts.leaderKey')?.value ?? 'Mod+X';

function HotkeyBadge({ hotkey, isSequence }: { hotkey: string | null; isSequence: boolean }) {
  if (!hotkey) {
    return (
      <Text as="span" variant="body-strong" tone="faint">
        Unassigned
      </Text>
    );
  }

  // Handle LEADER+ prefixed hotkeys: show resolved leader key, then arrow, then suffix
  if (hotkey.startsWith('LEADER+')) {
    const suffix = hotkey.slice('LEADER+'.length);
    const suffixDisplayKeys = formatForDisplay(suffix).split('+');

    return (
      <span className="inline-flex items-center gap-space-s">
        <Kbd>Leader</Kbd>
        <Text variant="micro" tone="muted">
          then
        </Text>
        {suffixDisplayKeys.map((key) => (
          <Kbd key={`suffix-${key}`}>{key}</Kbd>
        ))}
      </span>
    );
  }

  const displayKeys = formatForDisplay(hotkey).split('+');

  if (isSequence) {
    return (
      <span className="inline-flex gap-space-s">
        {displayKeys.map((key) => (
          <Kbd key={`first-${key}`}>{key}</Kbd>
        ))}
        {displayKeys.map((key) => (
          <Kbd key={`second-${key}`}>{key}</Kbd>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex gap-space-s">
      {displayKeys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
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
    <div className="border-b border-border-subtle px-space-xl py-space-m transition-colors last:border-0 hover:bg-surface-sunken">
      <Stack direction="row" align="center" justify="between">
        <Stack direction="row" align="center" gap="l">
          <Text as="span" variant="body-strong">
            {entry.label}
          </Text>
          {!isDefault && (
            <Badge variant="soft" size="xs" className="uppercase">
              Custom
            </Badge>
          )}
        </Stack>
        <Button
          type="button"
          variant={conflict ? 'destructive-quiet' : isRecording ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => !isLeaderShortcut && onStartRecording(entry.actionId)}
          className={isLeaderShortcut ? 'cursor-default' : 'cursor-pointer'}>
          {isRecording ? (
            <span className="italic">
              <Text variant="label" tone="muted">
                Press keys...
              </Text>
            </span>
          ) : conflict ? (
            <Text variant="label" tone="destructive">
              Conflicts with {conflict}
            </Text>
          ) : (
            <HotkeyBadge hotkey={entry.hotkey} isSequence={entry.isSequence} />
          )}
        </Button>
      </Stack>
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

      if (BLOCKED_HOTKEYS.has(hotkey)) {
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

  const q = search.toLowerCase();
  const filtered = q ? shortcuts.filter((e) => e.label.toLowerCase().includes(q)) : shortcuts;

  const groups = groupByCategory(filtered);

  const conflicts = new Map<string, string>();
  const hotkeyToDef = new Map<string, ShortcutEntry>();
  for (const entry of shortcuts) {
    if (!entry.hotkey) continue;
    // Use hotkey + isSequence as the conflict key so single-press and double-press don't clash
    const conflictKey = `${entry.hotkey}:${entry.isSequence}`;
    const existing = hotkeyToDef.get(conflictKey);
    if (existing) {
      conflicts.set(entry.actionId, existing.label);
      conflicts.set(existing.actionId, entry.label);
    } else {
      hotkeyToDef.set(conflictKey, entry);
    }
  }

  return (
    <Stack gap="3xl">
      <Stack direction="row" align="center" gap="l">
        <SearchInput
          containerClassName="flex-1 border-border-subtle bg-surface-sunken shadow-inner"
          placeholder="Search shortcuts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button
          variant="quiet"
          size="sm"
          className="shrink-0"
          onClick={() => resetAll.mutate()}
          disabled={resetAll.isPending}>
          Reset to defaults
        </Button>
      </Stack>

      <SettingSection title="Leader Key">
        <SettingRows>
          <SettingRow label="Leader key" description="Used as the prefix for LEADER+ shortcuts">
            <Button
              type="button"
              variant={recordingId === LEADER_KEY_RECORDING_ID ? 'secondary' : 'ghost'}
              size="sm"
              onClick={handleStartLeaderKeyRecording}
              className="cursor-pointer">
              {recordingId === LEADER_KEY_RECORDING_ID ? (
                <span className="italic">
                  <Text variant="label" tone="muted">
                    Press keys...
                  </Text>
                </span>
              ) : (
                <HotkeyBadge hotkey={leaderKey} isSequence={false} />
              )}
            </Button>
          </SettingRow>
        </SettingRows>
      </SettingSection>

      <Tabs defaultValue={SHORTCUT_CATEGORIES[0]} className="gap-space-xl">
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
            <TabsContent key={category} value={category} className="mt-space-xl">
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
                <Empty surface="muted" size="compact">
                  <EmptyDescription className="font-medium">
                    No {category.toLowerCase()} shortcuts match "{search}"
                  </EmptyDescription>
                </Empty>
              )}
            </TabsContent>
          );
        })}
      </Tabs>

      {recordingId && (
        <div className="pt-space-xl text-center">
          <Text variant="label" tone="muted">
            {recordingId === LEADER_KEY_RECORDING_ID
              ? 'Press Escape to cancel'
              : 'Press Escape to cancel · Backspace to unassign'}
          </Text>
        </div>
      )}
    </Stack>
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
