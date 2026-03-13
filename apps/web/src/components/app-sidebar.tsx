import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
} from '@/components/ui/sidebar'

export function AppSidebar() {
  return (
    <Sidebar collapsible="offcanvas" className="border-r-0!">
      <SidebarContent>
        <SidebarGroup />
      </SidebarContent>
    </Sidebar>
  )
}
