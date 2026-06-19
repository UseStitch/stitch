import * as React from 'react';

import { Popover, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type TextareaCompletionOption = {
  value: string;
  label: string;
  description?: string;
};

export type TextareaCompletionGroup = {
  prefix: string;
  label: string;
  options: TextareaCompletionOption[];
};

type CompletionState = {
  group: TextareaCompletionGroup;
  anchorIndex: number;
  filter: string;
};

type TextareaCompletionChildProps = {
  textareaProps: Pick<
    React.ComponentProps<'textarea'>,
    | 'aria-activedescendant'
    | 'aria-autocomplete'
    | 'aria-controls'
    | 'aria-expanded'
    | 'onBlur'
    | 'onChange'
    | 'onFocus'
    | 'onKeyDown'
    | 'onSelect'
  >;
  isOpen: boolean;
};

type TextareaCompletionsProps = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  groups: TextareaCompletionGroup[];
  disabled?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  children: (props: TextareaCompletionChildProps) => React.ReactNode;
};

function getCompletionState(
  textarea: HTMLTextAreaElement,
  groups: TextareaCompletionGroup[],
): CompletionState | null {
  const { selectionStart, selectionEnd, value } = textarea;
  if (selectionStart !== selectionEnd || document.activeElement !== textarea) return null;

  const textBeforeCaret = value.slice(0, selectionStart);
  let matchingGroup: TextareaCompletionGroup | null = null;
  let anchorIndex = -1;

  for (const group of groups) {
    const index = textBeforeCaret.lastIndexOf(group.prefix);
    if (index > anchorIndex) {
      matchingGroup = group;
      anchorIndex = index;
    }
  }

  if (!matchingGroup || anchorIndex < 0) return null;

  const previousCharacter = anchorIndex > 0 ? value[anchorIndex - 1] : '';
  if (previousCharacter && !/\s/.test(previousCharacter)) return null;

  const filter = value.slice(anchorIndex + matchingGroup.prefix.length, selectionStart);
  if (/\s/.test(filter)) return null;

  return { group: matchingGroup, anchorIndex, filter };
}

function filterCompletionOptions(state: CompletionState | null): TextareaCompletionOption[] {
  if (!state) return [];

  const filter = state.filter.toLocaleLowerCase();
  if (!filter) return state.group.options;

  return state.group.options.filter((option) => {
    return (
      option.value.toLocaleLowerCase().startsWith(filter) ||
      option.label.toLocaleLowerCase().startsWith(filter)
    );
  });
}

function getTextareaCharacterRect(textarea: HTMLTextAreaElement, index: number): DOMRect {
  const computedStyle = window.getComputedStyle(textarea);
  const mirror = document.createElement('div');
  const textareaRect = textarea.getBoundingClientRect();
  const properties = [
    'boxSizing',
    'width',
    'height',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'fontStyle',
    'letterSpacing',
    'lineHeight',
    'textTransform',
    'textIndent',
    'textAlign',
    'whiteSpace',
    'wordBreak',
    'overflowWrap',
    'tabSize',
  ] as const;

  mirror.style.position = 'fixed';
  mirror.style.top = `${textareaRect.top}px`;
  mirror.style.left = `${textareaRect.left}px`;
  mirror.style.visibility = 'hidden';
  mirror.style.pointerEvents = 'none';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.overflowWrap = 'break-word';

  for (const property of properties) {
    mirror.style[property] = computedStyle[property];
  }

  const before = textarea.value.slice(0, index);
  const marker = document.createElement('span');
  marker.textContent = textarea.value[index] || ' ';
  mirror.textContent = before;
  mirror.append(marker);
  document.body.append(mirror);

  const markerRect = marker.getBoundingClientRect();
  mirror.remove();

  return new DOMRect(
    markerRect.left - textarea.scrollLeft,
    markerRect.top - textarea.scrollTop,
    1,
    markerRect.height || Number.parseFloat(computedStyle.lineHeight) || 16,
  );
}

export function TextareaCompletions({
  textareaRef,
  value,
  onChange,
  groups,
  disabled,
  onKeyDown,
  children,
}: TextareaCompletionsProps) {
  const listId = React.useId();
  const [completionState, setCompletionState] = React.useState<CompletionState | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const completionOptions = filterCompletionOptions(completionState);
  const isOpen = completionState !== null && completionOptions.length > 0 && !disabled;

  const completionAnchor = React.useMemo(() => {
    return {
      getBoundingClientRect: () => {
        const textarea = textareaRef.current;
        if (!textarea || !completionState) return new DOMRect();

        return getTextareaCharacterRect(textarea, completionState.anchorIndex);
      },
    };
  }, [completionState, textareaRef]);

  const updateCompletionState = React.useCallback(() => {
    const textarea = textareaRef.current;
    const nextState = textarea ? getCompletionState(textarea, groups) : null;
    setCompletionState(nextState);
    setActiveIndex(0);
  }, [groups, textareaRef]);

  function applyCompletion(option: TextareaCompletionOption) {
    const textarea = textareaRef.current;
    if (!textarea || !completionState) return;

    const replacement = `${completionState.group.prefix}${option.value} `;
    const prefix = value.slice(0, completionState.anchorIndex) + replacement;
    const suffix = value.slice(textarea.selectionEnd);

    onChange(prefix + suffix);
    setCompletionState(null);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(prefix.length, prefix.length);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (isOpen) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((index) => (index + 1) % completionOptions.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((index) => (index === 0 ? completionOptions.length - 1 : index - 1));
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setCompletionState(null);
        return;
      }

      if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
        event.preventDefault();
        applyCompletion(completionOptions[activeIndex]);
        return;
      }
    }

    onKeyDown?.(event);
  }

  const textareaProps: TextareaCompletionChildProps['textareaProps'] = {
    'aria-activedescendant': isOpen ? `${listId}-${activeIndex}` : undefined,
    'aria-autocomplete': 'list',
    'aria-controls': isOpen ? listId : undefined,
    'aria-expanded': isOpen,
    onChange: (event) => {
      onChange(event.target.value);
      requestAnimationFrame(updateCompletionState);
    },
    onKeyDown: handleKeyDown,
    onSelect: updateCompletionState,
    onBlur: () => setCompletionState(null),
    onFocus: updateCompletionState,
  };

  return (
    <>
      {children({ textareaProps, isOpen })}
      <Popover open={isOpen} modal={false}>
        <PopoverContent
          anchor={completionAnchor}
          align="start"
          collisionPadding={8}
          finalFocus={false}
          initialFocus={false}
          side="bottom"
          sideOffset={6}
          className="w-72 gap-1 p-1"
        >
          <div id={listId} role="listbox" className="thin-scrollbar max-h-64 overflow-y-auto">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {completionState?.group.label}
            </div>
            {completionOptions.map((option, index) => (
              <button
                id={`${listId}-${index}`}
                key={option.value}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  'flex w-full cursor-default flex-col rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors',
                  index === activeIndex && 'bg-muted text-foreground',
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => applyCompletion(option)}
              >
                <span className="font-medium">
                  {completionState?.group.prefix}
                  {option.value}
                </span>
                {option.description ? (
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
