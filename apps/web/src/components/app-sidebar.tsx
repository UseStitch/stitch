import * as React from 'react'
import { Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon, MessageSquareIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
} from '@/components/ui/sidebar'
import { sessionsQueryOptions } from '@/lib/queries/chat'

export function AppSidebar() {
  const { data: sessions } = useQuery(sessionsQueryOptions)

  // Try to read the current session id from the route params (may not exist)
  const params = useParams({ strict: false }) as { id?: string }
  const currentId = params.id

  return (
    <Sidebar collapsible="offcanvas" className="border-r-0!">
      <SidebarHeader className="pb-0">
        <SidebarMenuButton
          render={<Link to="/" className="flex items-center gap-2 font-medium" />}
        >
          <PlusIcon className="size-4" />
          New Chat
        </SidebarMenuButton>
      </SidebarHeader>

      <SidebarContent>
        {sessions && sessions.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[...sessions].reverse().map((session) => (
                  <SidebarMenuItem key={session.id}>
                    <SidebarMenuButton
                      isActive={session.id === currentId}
                      render={
                        <Link
                          to="/session/$id"
                          params={{ id: session.id }}
                          className="flex items-center gap-2 truncate"
                        />
                      }
                    >
                      <MessageSquareIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {session.title ?? 'New conversation'}
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  )
}
