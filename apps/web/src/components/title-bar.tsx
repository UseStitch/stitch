import { Minus, Square, X, Copy, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useEffect, useState } from 'react'

interface TitleBarProps {
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
}

export function TitleBar({ sidebarOpen = true, onToggleSidebar }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.api?.window?.isMaximized) {
        const maximized = await window.api.window.isMaximized()
        setIsMaximized(maximized)
      }
    }
    checkMaximized()
  }, [])

  const handleMinimize = () => {
    window.api?.window?.minimize()
  }

  const handleMaximize = async () => {
    await window.api?.window?.maximize()
    const maximized = await window.api?.window?.isMaximized()
    setIsMaximized(maximized ?? false)
  }

  const handleClose = () => {
    window.api?.window?.close()
  }

  return (
    <div className="h-9 bg-background flex items-center justify-between select-none" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-center h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={onToggleSidebar}
          className="w-9 h-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          {sidebarOpen ? (
            <PanelLeftClose className="w-4 h-4 text-muted-foreground" />
          ) : (
            <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
        <div className="text-sm text-muted-foreground font-medium px-2">
          Openwork
        </div>
      </div>
      <div className="flex h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          <Minus className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-muted transition-colors"
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Square className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-destructive transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}
