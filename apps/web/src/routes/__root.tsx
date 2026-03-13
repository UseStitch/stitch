import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import * as React from 'react'
import { useHotkey } from '@tanstack/react-hotkeys'
import { TitleBar } from '../components/title-bar'
import { AppSidebar } from '../components/app-sidebar'
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar'
import { CommandPalette } from '../components/command-palette'
import { SettingsDialog } from '../components/settings-dialog'
import { Toaster } from '../components/ui/sonner'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const [commandOpen, setCommandOpen] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  useHotkey('Mod+P', () => setCommandOpen((o) => !o), { preventDefault: true })
  useHotkey('Mod+,', () => setSettingsOpen((o) => !o), { preventDefault: true })

  return (
    <SidebarProvider className="h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden relative">
        <AppSidebar />
        <SidebarInset className="bg-muted rounded-tl-2xl border-l border-border/50 overflow-hidden shadow-sm">
          <Outlet />
        </SidebarInset>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <Toaster position="bottom-right" />
    </SidebarProvider>
  )
}
