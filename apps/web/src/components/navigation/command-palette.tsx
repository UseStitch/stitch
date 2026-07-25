import { formatForDisplay } from '@tanstack/react-hotkeys';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useDialogContext } from '@/context/dialog-context';
import type { Action } from '@/lib/actions';
import { useShortcuts } from '@/lib/shortcuts';

type CommandPaletteProps = { actions: Action[] };

function toKeyItems(labels: string[]): Array<{ id: string; label: string }> {
  const occurrences = new Map<string, number>();
  return labels.map((label) => {
    const occurrence = (occurrences.get(label) ?? 0) + 1;
    occurrences.set(label, occurrence);
    return { id: `${label}-${occurrence}`, label };
  });
}

export function CommandPalette({ actions }: CommandPaletteProps) {
  const { commandPaletteOpen, setCommandPaletteOpen } = useDialogContext();
  const shortcuts = useShortcuts();

  function handleSelect(action: Action) {
    setCommandPaletteOpen(false);
    action.run();
  }

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <DialogHeader className="sr-only">
        <DialogTitle>Command Palette</DialogTitle>
        <DialogDescription>Search for a command to run...</DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-1/3! translate-y-0! overflow-hidden rounded-xl! p-0 sm:max-w-lg!"
        showCloseButton={false}>
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              {actions
                .filter((a) => a.id !== 'command-palette')
                .map((action) => {
                  const info = shortcuts.get(action.id);
                  const hotkey = info?.hotkey ?? null;
                  const isLeaderShortcut = typeof hotkey === 'string' && hotkey.startsWith('LEADER+');
                  const leaderSuffix = isLeaderShortcut ? hotkey.slice('LEADER+'.length) : null;
                  const keyItems = toKeyItems(
                    hotkey === null
                      ? []
                      : isLeaderShortcut
                        ? [
                            'Leader',
                            ...formatForDisplay(leaderSuffix ?? '')
                              .split('+')
                              .filter(Boolean),
                          ]
                        : info?.isSequence
                          ? [...formatForDisplay(hotkey).split('+'), ...formatForDisplay(hotkey).split('+')]
                          : formatForDisplay(hotkey).split('+'),
                  );
                  return (
                    <CommandItem key={action.id} onSelect={() => handleSelect(action)}>
                      <span className="flex-1">{action.label}</span>
                      {hotkey && (
                        <span className="ml-auto flex items-center gap-1.5">
                          {keyItems.map((item) => (
                            <Kbd key={item.id} size="sm">
                              {item.label}
                            </Kbd>
                          ))}
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
