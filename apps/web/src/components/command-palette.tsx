import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useDialogContext } from "@/context/dialog-context"
import { useActions, type Action } from "@/lib/actions"

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useDialogContext()
  const actions = useActions()

  function handleSelect(action: Action) {
    setCommandPaletteOpen(false)
    action.run()
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
              {actions.map((action) => (
                <CommandItem key={action.id} onSelect={() => handleSelect(action)}>
                  {action.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
