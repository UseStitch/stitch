import * as React from "react"
import { MonitorIcon, KeyboardIcon, ServerIcon, SparklesIcon } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface SettingsSection {
  label: string
  items: SettingsNavItem[]
}

interface SettingsNavItem {
  id: string
  label: string
  icon: React.ReactNode
}

const SECTIONS: SettingsSection[] = [
  {
    label: "Desktop",
    items: [
      { id: "general", label: "General", icon: <MonitorIcon className="size-4" /> },
      { id: "shortcuts", label: "Shortcuts", icon: <KeyboardIcon className="size-4" /> },
    ],
  },
  {
    label: "Server",
    items: [
      { id: "providers", label: "Providers", icon: <ServerIcon className="size-4" /> },
      { id: "models", label: "Models", icon: <SparklesIcon className="size-4" /> },
    ],
  },
]

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeItem, setActiveItem] = React.useState("general")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Settings</DialogTitle>
      </DialogHeader>
      <DialogContent
        className="max-w-3xl! h-140 p-0 gap-0 overflow-hidden flex flex-col"
        showCloseButton={false}
      >
        <div className="flex flex-1 overflow-hidden">
          <aside className="w-52 bg-muted/40 border-r flex flex-col p-3 gap-4 shrink-0">
            {SECTIONS.map((section) => (
              <div key={section.label} className="flex flex-col gap-0.5">
                <span className="text-muted-foreground text-xs px-2 py-1">{section.label}</span>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveItem(item.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-left transition-colors",
                      activeItem === item.id
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
            <div className="mt-auto">
              <p className="text-muted-foreground text-xs px-2">Openwork Desktop</p>
              <p className="text-muted-foreground text-xs px-2">v0.0.1</p>
            </div>
          </aside>
          <main className="flex-1 overflow-y-auto p-6">
            <SettingsContent activeItem={activeItem} />
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SettingsContent({ activeItem }: { activeItem: string }) {
  switch (activeItem) {
    case "general":
      return <GeneralSettings />
    case "shortcuts":
      return <PlaceholderSettings title="Shortcuts" />
    case "providers":
      return <PlaceholderSettings title="Providers" />
    case "models":
      return <PlaceholderSettings title="Models" />
    default:
      return null
  }
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-4 border-b last:border-b-0">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{description}</span>
      </div>
      {children}
    </div>
  )
}

function GeneralSettings() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold mb-1">General</h2>
      </div>
      <div className="flex flex-col">
        <SettingsRow label="Language" description="Change the display language">
          <select className="bg-muted border border-border rounded-md px-2 py-1 text-sm">
            <option>English</option>
          </select>
        </SettingsRow>
        <SettingsRow
          label="Show reasoning summaries"
          description="Display model reasoning summaries in the timeline"
        >
          <input type="checkbox" className="h-4 w-4 rounded" />
        </SettingsRow>
        <SettingsRow
          label="Expand shell tool parts"
          description="Show shell tool parts expanded by default in the timeline"
        >
          <input type="checkbox" className="h-4 w-4 rounded" defaultChecked />
        </SettingsRow>
        <SettingsRow
          label="Expand edit tool parts"
          description="Show edit, write, and patch tool parts expanded by default in the timeline"
        >
          <input type="checkbox" className="h-4 w-4 rounded" />
        </SettingsRow>
      </div>
      <div>
        <h2 className="text-base font-semibold mb-1">Appearance</h2>
        <div className="flex flex-col">
          <SettingsRow
            label="Color scheme"
            description="Choose whether Openwork follows the system, light, or dark theme"
          >
            <select className="bg-muted border border-border rounded-md px-2 py-1 text-sm">
              <option>System</option>
              <option>Light</option>
              <option>Dark</option>
            </select>
          </SettingsRow>
          <SettingsRow label="Theme" description="Choose a color theme">
            <select className="bg-muted border border-border rounded-md px-2 py-1 text-sm">
              <option>Default</option>
            </select>
          </SettingsRow>
        </div>
      </div>
    </div>
  )
}

function PlaceholderSettings({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted-foreground text-sm">Coming soon.</p>
    </div>
  )
}
