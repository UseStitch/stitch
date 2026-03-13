import * as React from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useHotkeyRecorder, formatForDisplay } from '@tanstack/react-hotkeys'
import { SearchIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SHORTCUT_DEFINITIONS, type ShortcutDefinition } from '@/lib/shortcuts'
import { shortcutsQueryOptions, useSaveShortcut, useDeleteShortcut, useResetAllShortcuts } from '@/lib/queries/shortcuts'
import { cn } from '@/lib/utils'

function resolveHotkey(def: ShortcutDefinition, overrides: Record<string, string | null>): string | null {
  return def.id in overrides ? overrides[def.id]! : def.defaultHotkey
}

function groupByCategory(defs: ShortcutDefinition[]): Map<string, ShortcutDefinition[]> {
  const groups = new Map<string, ShortcutDefinition[]>()
  for (const def of defs) {
    const existing = groups.get(def.category) ?? []
    existing.push(def)
    groups.set(def.category, existing)
  }
  return groups
}

function HotkeyBadge({ hotkey }: { hotkey: string | null }) {
  if (!hotkey) {
    return <span className="text-muted-foreground text-sm">Unassigned</span>
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
  )
}

function ShortcutRow({
  def,
  currentHotkey,
  isDefault,
  conflict,
  recordingId,
  onStartRecording,
}: {
  def: ShortcutDefinition
  currentHotkey: string | null
  isDefault: boolean
  conflict: string | null
  recordingId: string | null
  onStartRecording: (id: string) => void
}) {
  const isRecording = recordingId === def.id

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm">{def.label}</span>
        {!isDefault && (
          <span className="text-xs text-muted-foreground rounded bg-muted px-1.5 py-0.5">custom</span>
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
              : 'hover:bg-accent/50 cursor-pointer'
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
  )
}

function ShortcutsContent() {
  const { data: overrides } = useSuspenseQuery(shortcutsQueryOptions)
  const saveShortcut = useSaveShortcut()
  const deleteShortcut = useDeleteShortcut()
  const resetAll = useResetAllShortcuts()

  const [search, setSearch] = React.useState('')
  const [recordingId, setRecordingId] = React.useState<string | null>(null)
  const [conflict, setConflict] = React.useState<{ id: string; conflictLabel: string } | null>(null)
  const [pendingRecord, setPendingRecord] = React.useState<{ id: string; hotkey: string } | null>(null)

  const recorder = useHotkeyRecorder({
    onRecord: (hotkey) => {
      if (!recordingId) return

      // Check for conflicts with other shortcuts
      const conflictDef = SHORTCUT_DEFINITIONS.find((def) => {
        if (def.id === recordingId) return false
        return resolveHotkey(def, overrides) === hotkey
      })

      if (conflictDef) {
        setConflict({ id: recordingId, conflictLabel: conflictDef.label })
        setPendingRecord({ id: recordingId, hotkey })
        setRecordingId(null)
      } else {
        saveShortcut.mutate({ actionId: recordingId, hotkey })
        setRecordingId(null)
      }
    },
    onCancel: () => setRecordingId(null),
    onClear: () => {
      if (recordingId) {
        deleteShortcut.mutate(recordingId)
        setRecordingId(null)
      }
    },
  })

  function handleStartRecording(id: string) {
    setConflict(null)
    setPendingRecord(null)
    setRecordingId(id)
    recorder.startRecording()
  }

  function handleConfirmConflict() {
    if (!pendingRecord) return
    saveShortcut.mutate({ actionId: pendingRecord.id, hotkey: pendingRecord.hotkey })
    setConflict(null)
    setPendingRecord(null)
  }

  function handleCancelConflict() {
    setConflict(null)
    setPendingRecord(null)
  }

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase()
    return q ? SHORTCUT_DEFINITIONS.filter((d) => d.label.toLowerCase().includes(q)) : SHORTCUT_DEFINITIONS
  }, [search])

  const groups = React.useMemo(() => groupByCategory(filtered), [filtered])

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

      {conflict && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm flex items-center justify-between gap-4">
          <span>
            <span className="font-medium">
              {formatForDisplay(pendingRecord?.hotkey ?? '')}
            </span>{' '}
            is already assigned to <span className="font-medium">{conflict.conflictLabel}</span>. Override it?
          </span>
          <div className="flex gap-2 shrink-0">
            <Button size="sm" variant="destructive" onClick={handleConfirmConflict}>
              Override
            </Button>
            <Button size="sm" variant="ghost" onClick={handleCancelConflict}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {groups.size === 0 && (
        <p className="text-muted-foreground text-sm text-center py-4">No shortcuts found</p>
      )}

      {Array.from(groups.entries()).map(([category, defs]) => (
        <div key={category}>
          <h3 className="text-sm font-medium text-muted-foreground mb-1">{category}</h3>
          <div>
            {defs.map((def) => {
              const currentHotkey = resolveHotkey(def, overrides)
              const isDefault = currentHotkey === def.defaultHotkey
              const isConflicting = conflict?.id === def.id
              return (
                <ShortcutRow
                  key={def.id}
                  def={def}
                  currentHotkey={currentHotkey}
                  isDefault={isDefault}
                  conflict={isConflicting ? conflict.conflictLabel : null}
                  recordingId={recordingId}
                  onStartRecording={handleStartRecording}
                />
              )
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
  )
}

export function ShortcutsSettings() {
  return (
    <div className="flex flex-col h-full">
      <div className="mb-4">
        <h2 className="text-[15px] font-bold">Keyboard shortcuts</h2>
      </div>
      <React.Suspense fallback={<div className="text-muted-foreground text-sm">Loading...</div>}>
        <ShortcutsContent />
      </React.Suspense>
    </div>
  )
}
