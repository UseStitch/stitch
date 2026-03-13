import { Group, Panel, Separator } from 'react-resizable-panels'
import type { ReactNode } from 'react'

interface ResizableLayoutProps {
  sidebar: ReactNode
  children: ReactNode
  defaultSize?: string
  minSize?: string
  maxSize?: string
}

export function ResizableLayout({
  sidebar,
  children,
  defaultSize = "15%",
  minSize = "15%",
  maxSize = "30%",
}: ResizableLayoutProps) {
  return (
    <Group orientation="horizontal" className="h-full">
      <Panel defaultSize={defaultSize} minSize={minSize} maxSize={maxSize}>
        {sidebar}
      </Panel>
      <Separator className="w-0 bg-transparent hover:bg-primary transition-colors" />
      <Panel minSize="20%">{children}</Panel>
    </Group>
  )
}
