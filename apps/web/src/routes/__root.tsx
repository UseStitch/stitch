import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { TitleBar } from '../components/title-bar'
import { AppSidebar } from '../components/app-sidebar'
import { SidebarInset, SidebarProvider } from '../components/ui/sidebar'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return (
    <SidebarProvider className="h-screen flex-col overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden relative">
        <AppSidebar />
        <SidebarInset className="bg-muted rounded-tl-2xl border-l border-border/50 overflow-hidden shadow-sm">
          <Outlet />
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
