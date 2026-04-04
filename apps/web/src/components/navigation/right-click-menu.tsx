import {
  BookPlus,
  Scissors,
  Copy,
  ClipboardPaste,
  Terminal,
  ChevronRight,
  SpellCheck,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useCallback, useState, useRef, forwardRef } from 'react';
import { createPortal } from 'react-dom';

import type { ContextMenuParams } from '@/lib/api';
import { cn } from '@/lib/utils';

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
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex w-full cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-none',
        'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
      {hasSubmenu && <ChevronRight className="ml-auto" />}
    </button>
  );
});

function Separator() {
  return <div className="-mx-1 my-1 h-px bg-border" />;
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
  const [style, setStyle] = useState<React.CSSProperties>({});

  useLayoutEffect(() => {
    if (!anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const submenuWidth = 192;
    const spaceRight = window.innerWidth - rect.right;
    const left = spaceRight >= submenuWidth ? rect.right + 2 : rect.left - submenuWidth - 2;
    setStyle({ position: 'fixed', top: rect.top, left });
  }, [anchorRef]);

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-60 min-w-48 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {suggestions.length === 0 && (
        <div className="px-1.5 py-1 text-sm text-muted-foreground">No suggestions</div>
      )}
      {suggestions.slice(0, 5).map((s) => (
        <MenuItem key={s} onClick={() => onReplace(s)}>
          {s}
        </MenuItem>
      ))}
      {suggestions.length > 0 && <Separator />}
      <MenuItem onClick={onAddToDictionary}>
        <BookPlus />
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
    const unsub = window.electron?.on('context-menu', (raw) => {
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

  const handleSpellingMouseEnter = useCallback(() => {
    if (spellingCloseTimer.current) clearTimeout(spellingCloseTimer.current);
    setSpellingOpen(true);
  }, []);

  const handleSpellingMouseLeave = useCallback(() => {
    spellingCloseTimer.current = setTimeout(() => setSpellingOpen(false), 150);
  }, []);

  const handleSubmenuMouseEnter = useCallback(() => {
    if (spellingCloseTimer.current) clearTimeout(spellingCloseTimer.current);
  }, []);

  const handleSubmenuMouseLeave = useCallback(() => {
    spellingCloseTimer.current = setTimeout(() => setSpellingOpen(false), 150);
  }, []);

  const handleReplaceMisspelling = useCallback(
    (suggestion: string) => {
      void window.api?.spellcheck?.replaceMisspelling(suggestion);
      close();
    },
    [close],
  );

  const handleAddToDictionary = useCallback(() => {
    if (params?.misspelledWord) {
      void window.api?.spellcheck?.addToDictionary(params.misspelledWord);
    }
    close();
  }, [params?.misspelledWord, close]);

  const handleCut = useCallback(() => {
    document.execCommand('cut');
    close();
  }, [close]);
  const handleCopy = useCallback(() => {
    document.execCommand('copy');
    close();
  }, [close]);
  const handlePaste = useCallback(() => {
    document.execCommand('paste');
    close();
  }, [close]);
  const handleOpenDevTools = useCallback(() => {
    void window.api?.devtools?.toggle();
    close();
  }, [close]);

  const isMisspelled = !!params?.misspelledWord;
  const isEditable = params?.isEditable ?? false;
  const { canCut, canCopy, canPaste } = params?.editFlags ?? {
    canCut: false,
    canCopy: false,
    canPaste: false,
  };

  const showEditSection = isEditable && (canCut || canCopy || canPaste);

  return (
    <>
      {children}
      {params &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-50 min-w-48 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
            style={{ left: params.x, top: params.y }}
          >
            {isMisspelled && (
              <>
                <MenuItem
                  ref={spellingTriggerRef}
                  hasSubmenu
                  onMouseEnter={handleSpellingMouseEnter}
                  onMouseLeave={handleSpellingMouseLeave}
                >
                  <SpellCheck />
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
                    <Scissors />
                    Cut
                  </MenuItem>
                )}
                {canCopy && (
                  <MenuItem onClick={handleCopy}>
                    <Copy />
                    Copy
                  </MenuItem>
                )}
                {canPaste && (
                  <MenuItem onClick={handlePaste}>
                    <ClipboardPaste />
                    Paste
                  </MenuItem>
                )}
                <Separator />
              </>
            )}

            <MenuItem onClick={handleOpenDevTools}>
              <Terminal />
              Open Developer Tools
            </MenuItem>
          </div>,
          document.body,
        )}
    </>
  );
}
