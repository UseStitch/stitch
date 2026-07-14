import { formatForDisplay } from '@tanstack/react-hotkeys';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { useDialogContext } from '@/context/dialog-context';
import type { Action } from '@/lib/actions';
import { useShortcuts } from '@/lib/shortcuts';

type CommandPaletteProps = { actions: Action[] };

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
                  return (
                    <CommandItem key={action.id} onSelect={() => handleSelect(action)}>
                      <span className="flex-1">{action.label}</span>
                      {hotkey && (
                        <span className="ml-auto flex items-center gap-1.5">
                          {isLeaderShortcut
                            ? [
                                'Leader',
                                ...formatForDisplay(leaderSuffix ?? '')
                                  .split('+')
                                  .filter(Boolean),
                              ].map((key, i) => (
                                <Kbd key={i} size="sm">
                                  {key}
                                </Kbd>
                              ))
                            : info?.isSequence
                              ? [...formatForDisplay(hotkey).split('+'), ...formatForDisplay(hotkey).split('+')].map(
                                  (key, i) => (
                                    <Kbd key={i} size="sm">
                                      {key}
                                    </Kbd>
                                  ),
                                )
                              : formatForDisplay(hotkey)
                                  .split('+')
                                  .map((key, i) => (
                                    <Kbd key={i} size="sm">
                                      {key}
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
