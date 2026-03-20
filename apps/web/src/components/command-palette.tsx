import { formatForDisplay } from '@tanstack/react-hotkeys';

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDialogContext } from '@/context/dialog-context';
import { useActions, type Action } from '@/lib/actions';
import { useShortcuts } from '@/lib/shortcuts';

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useDialogContext();
  const actions = useActions();
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
        className="rounded-xl! top-1/3! translate-y-0! overflow-hidden p-0 sm:max-w-lg!"
        showCloseButton={false}
      >
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Actions">
              {actions.map((action) => {
                const info = shortcuts.get(action.id);
                const hotkey = info?.hotkey ?? null;
                return (
                  <CommandItem key={action.id} onSelect={() => handleSelect(action)}>
                    <span className="flex-1">{action.label}</span>
                    {hotkey && (
                      <span className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground">
                        {info?.isSequence
                          ? [
                              ...formatForDisplay(hotkey).split('+'),
                              ...formatForDisplay(hotkey).split('+'),
                            ].map((key, i) => (
                              <kbd
                                key={i}
                                className="inline-flex items-center justify-center rounded border border-foreground/15 bg-foreground/10 px-1.5 py-0.5 text-[11px] font-medium leading-none"
                              >
                                {key}
                              </kbd>
                            ))
                          : formatForDisplay(hotkey)
                              .split('+')
                              .map((key, i) => (
                                <kbd
                                  key={i}
                                  className="inline-flex items-center justify-center rounded border border-foreground/15 bg-foreground/10 px-1.5 py-0.5 text-[11px] font-medium leading-none"
                                >
                                  {key}
                                </kbd>
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
