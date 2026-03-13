import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { TitleBar } from '../components/title-bar'
import { ResizableLayout } from '../components/resizable-layout'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  const [sidebarOpen, setSidebarOpen] = useState(true)

  return (
    <div className="h-screen flex flex-col bg-background">
      <TitleBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="flex-1 overflow-hidden">
        {sidebarOpen && (
          <ResizableLayout
            sidebar={
              <div className="h-full p-2">
                <div className="text-muted-foreground text-sm">Sidebar</div>
              </div>
            }
          >
            <div className="h-full bg-muted rounded-tl-2xl border-l border-t border-border/50 overflow-hidden shadow-sm">
              <Outlet />
            </div>
          </ResizableLayout>
        )}
        {!sidebarOpen && (
          <div className="h-full bg-muted">
            <Outlet />
          </div>
        )}
      </div>
    </div>
  )
}
