import { cn } from 'cnfast';
import { BookPlus, Scissors, Copy, ClipboardPaste, Terminal, ChevronRight, SpellCheck } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useState, useRef, forwardRef } from 'react';
import { createPortal } from 'react-dom';

import { Icon } from '@/components/primitives/icon';
import { Text } from '@/components/primitives/text';
import { Button } from '@/components/ui/button';
import type { ContextMenuParams } from '@/lib/api';

interface RightClickMenuProps {
  children: React.ReactNode;
}

interface MenuItemProps {
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  hasSubmenu?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { onClick, children, className, hasSubmenu, onMouseEnter, onMouseLeave },
  ref,
) {
  return (
    <Button
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      width="full"
      align={hasSubmenu ? 'between' : 'start'}
      className={cn('cursor-default', className)}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}>
      {children}
      {hasSubmenu && <Icon as={ChevronRight} size="m" />}
    </Button>
  );
});

function Separator() {
  return <div className="-mx-space-xs my-space-xs h-px bg-border" />;
}

interface SpellingSubmenuProps {
  suggestions: string[];
  misspelledWord: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  onReplace: (s: string) => void;
  onAddToDictionary: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function SpellingSubmenu({
  suggestions,
  misspelledWord,
  anchorRef,
  panelRef,
  onReplace,
  onAddToDictionary,
  onMouseEnter,
  onMouseLeave,
}: SpellingSubmenuProps) {
  const [style, setStyle] = useState<Pick<React.CSSProperties, 'top' | 'left'>>({});

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const submenuWidth = 192;
    const spaceRight = window.innerWidth - rect.right;
    const left = spaceRight >= submenuWidth ? rect.right + 2 : rect.left - submenuWidth - 2;
    setStyle({ top: rect.top, left });
  }, [anchorRef]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-60 min-w-48 rounded-lg bg-popover p-space-xs text-popover-foreground shadow-md ring-1 ring-border-subtle"
      style={{ top: style.top, left: style.left }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}>
      {suggestions.length === 0 && (
        <div className="px-space-s py-space-xs">
          <Text variant="body" tone="muted">
            No suggestions
          </Text>
        </div>
      )}
      {suggestions.slice(0, 5).map((s) => (
        <MenuItem key={s} onClick={() => onReplace(s)}>
          {s}
        </MenuItem>
      ))}
      {suggestions.length > 0 && <Separator />}
      <MenuItem onClick={onAddToDictionary}>
        <Icon as={BookPlus} size="m" />
        Add &ldquo;{misspelledWord}&rdquo; to Dictionary
      </MenuItem>
    </div>,
    document.body,
  );
}

export function RightClickMenu({ children }: RightClickMenuProps) {
  const [params, setParams] = useState<ContextMenuParams | null>(null);
  const [spellingOpen, setSpellingOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const spellingTriggerRef = useRef<HTMLButtonElement>(null);
  const spellingCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = window.electron?.subscribe('context-menu', (raw) => {
      setParams(raw as ContextMenuParams);
      setSpellingOpen(false);
    });
    return unsub;
  }, []);

  const close = useCallback(() => {
    setParams(null);
    setSpellingOpen(false);
  }, []);

  useEffect(() => {
    if (!params) return;

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target);
      const inSubmenu = submenuRef.current?.contains(target);
      if (!inMenu && !inSubmenu) {
        close();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const handleContextMenu = () => close();

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [params, close]);

  const handleSpellingMouseEnter = () => {
    if (spellingCloseTimer.current) clearTimeout(spellingCloseTimer.current);
    setSpellingOpen(true);
  };

  const handleSpellingMouseLeave = () => {
    spellingCloseTimer.current = setTimeout(() => setSpellingOpen(false), 150);
  };

  const handleSubmenuMouseEnter = () => {
    if (spellingCloseTimer.current) clearTimeout(spellingCloseTimer.current);
  };

  const handleSubmenuMouseLeave = () => {
    spellingCloseTimer.current = setTimeout(() => setSpellingOpen(false), 150);
  };

  const handleReplaceMisspelling = (suggestion: string) => {
    void window.api?.spellcheck?.replaceMisspelling(suggestion);
    close();
  };

  const misspelledWord = params?.misspelledWord ?? null;

  const handleAddToDictionary = () => {
    if (misspelledWord) {
      void window.api?.spellcheck?.addToDictionary(misspelledWord);
    }
    close();
  };

  const handleCut = () => {
    document.execCommand('cut');
    close();
  };
  const handleCopy = () => {
    document.execCommand('copy');
    close();
  };
  const handlePaste = () => {
    document.execCommand('paste');
    close();
  };
  const handleOpenDevTools = () => {
    void window.api?.devtools?.toggle();
    close();
  };

  const isMisspelled = !!misspelledWord;
  const isEditable = params?.isEditable ?? false;
  const { canCut, canCopy, canPaste } = params?.editFlags ?? { canCut: false, canCopy: false, canPaste: false };

  const showEditSection = isEditable && (canCut || canCopy || canPaste);

  return (
    <>
      {children}
      {params &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 min-w-48 rounded-lg bg-popover p-space-xs text-popover-foreground shadow-md ring-1 ring-border-subtle"
            style={{ left: params.x, top: params.y }}>
            {isMisspelled && (
              <>
                <MenuItem
                  ref={spellingTriggerRef}
                  hasSubmenu
                  onMouseEnter={handleSpellingMouseEnter}
                  onMouseLeave={handleSpellingMouseLeave}>
                  <Icon as={SpellCheck} size="m" />
                  Spelling
                </MenuItem>
                {spellingOpen && (
                  <SpellingSubmenu
                    suggestions={params.dictionarySuggestions}
                    misspelledWord={params.misspelledWord}
                    anchorRef={spellingTriggerRef}
                    panelRef={submenuRef}
                    onReplace={handleReplaceMisspelling}
                    onAddToDictionary={handleAddToDictionary}
                    onMouseEnter={handleSubmenuMouseEnter}
                    onMouseLeave={handleSubmenuMouseLeave}
                  />
                )}
                <Separator />
              </>
            )}

            {showEditSection && (
              <>
                {canCut && (
                  <MenuItem onClick={handleCut}>
                    <Icon as={Scissors} size="m" />
                    Cut
                  </MenuItem>
                )}
                {canCopy && (
                  <MenuItem onClick={handleCopy}>
                    <Icon as={Copy} size="m" />
                    Copy
                  </MenuItem>
                )}
                {canPaste && (
                  <MenuItem onClick={handlePaste}>
                    <Icon as={ClipboardPaste} size="m" />
                    Paste
                  </MenuItem>
                )}
                <Separator />
              </>
            )}

            <MenuItem onClick={handleOpenDevTools}>
              <Icon as={Terminal} size="m" />
              Open Developer Tools
            </MenuItem>
          </div>,
          document.body,
        )}
    </>
  );
}
