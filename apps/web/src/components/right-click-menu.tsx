import { useState, useCallback, useEffect } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Terminal } from 'lucide-react';

interface RightClickMenuProps {
  children: React.ReactNode;
}

export function RightClickMenu({ children }: RightClickMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const handleContextMenu = useCallback((e: MouseEvent) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
    setIsOpen(true);
  }, []);

  const handleOpenDevTools = useCallback(() => {
    window.api?.devtools?.toggle();
  }, []);

  useEffect(() => {
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [handleContextMenu]);

  return (
    <ContextMenu open={isOpen} onOpenChange={setIsOpen}>
      <ContextMenuTrigger className="contents">{children}</ContextMenuTrigger>
      <ContextMenuContent
        className="fixed z-50 min-w-48"
        style={{ position: 'fixed', left: position.x, top: position.y }}
      >
        <ContextMenuItem onClick={handleOpenDevTools}>
          <Terminal className="mr-2 h-4 w-4" />
          Open Developer Tools
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
