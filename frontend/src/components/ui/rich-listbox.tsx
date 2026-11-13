import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface RichListBoxItem {
  value: string;
  label: string;
  /** Secondary descriptive text displayed below the label. */
  description?: string;
  /** Leading icon component from lucide-react. */
  icon?: LucideIcon;
  /** Right-aligned keyboard shortcut or badge text, e.g. "⌘K". */
  shortcut?: string;
  disabled?: boolean;
}

export interface RichListBoxGroup {
  /** Optional heading for this section. */
  label?: string;
  items: RichListBoxItem[];
}

export interface RichListBoxProps {
  /** Flat list of items. Ignored if `groups` is provided. */
  items?: RichListBoxItem[];
  /** Grouped sections of items. Takes precedence over `items`. */
  groups?: RichListBoxGroup[];
  /** Currently selected value (single mode). */
  value?: string;
  /** Selected values (multiple mode — requires `multiple`). */
  values?: string[];
  /** Single mode: fires with the picked value and closes the dropdown. */
  onChange?: (value: string) => void;
  /** Multiple mode: fires with the full selection; dropdown stays open. */
  onValuesChange?: (values: string[]) => void;
  /** Enable multi-select with badge rendering in the trigger. */
  multiple?: boolean;
  /**
   * Radix modal mode. Keep the default (true) when the listbox renders inside
   * a Dialog: the dialog's scroll-lock swallows wheel events aimed at portaled
   * popover content, and a modal popover brings its own lock that allows
   * scrolling within the list. Pass false only for standalone use where the
   * page must stay interactive while the list is open.
   */
  modal?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  /** Class name for the trigger button. */
  className?: string;
  /** Class name for the dropdown panel. */
  contentClassName?: string;
}

/**
 * Searchable rich dropdown for selecting items with icons, multi-line descriptions,
 * section groupings, and keyboard shortcuts.
 * Use for resource selection (e.g. projects, repositories, assignees, workflows).
 */
export function RichListBox({
  items,
  groups,
  value,
  values,
  onChange,
  onValuesChange,
  multiple = false,
  modal = true,
  placeholder = 'Select an item...',
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found.',
  disabled = false,
  className,
  contentClassName,
}: RichListBoxProps) {
  const [open, setOpen] = React.useState(false);

  // Normalize into standard groups list
  const normalizedGroups: RichListBoxGroup[] = React.useMemo(() => {
    if (groups && groups.length > 0) return groups;
    if (items && items.length > 0) return [{ items }];
    return [];
  }, [groups, items]);

  const allItems = React.useMemo(
    () => normalizedGroups.flatMap((g) => g.items),
    [normalizedGroups]
  );

  const selectedItem = React.useMemo(
    () => allItems.find((it) => it.value === value),
    [allItems, value]
  );

  const selectedValues = React.useMemo(
    () => (multiple ? values ?? [] : []),
    [multiple, values]
  );

  const handleSelect = (val: string) => {
    if (multiple) {
      const next = selectedValues.includes(val)
        ? selectedValues.filter((v) => v !== val)
        : [...selectedValues, val];
      onValuesChange?.(next);
      return; // dropdown stays open for more picks
    }
    onChange?.(val);
    setOpen(false);
  };

  const SelectedIcon = selectedItem?.icon;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={modal}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            // `bg-transparent` overrides the `outline` variant's `bg-background`
            // so this sits on a card exactly like Input/SelectTrigger do —
            // same border colour, same fill, same height.
            'w-full justify-between font-normal text-left px-3 bg-transparent',
            multiple ? 'min-h-9 h-auto py-1.5' : 'h-9',
            !selectedItem && !multiple && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {multiple ? (
              selectedValues.length > 0 ? (
                <div className="flex flex-wrap gap-1 min-w-0">
                  {selectedValues.map((v) => {
                    const item = allItems.find((it) => it.value === v);
                    return (
                      <Badge
                        key={v}
                        variant="secondary"
                        className="text-xs px-1.5 py-0.5 gap-1"
                      >
                        {item?.label ?? v}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelect(v); // removes in multiple mode
                          }}
                        />
                      </Badge>
                    );
                  })}
                </div>
              ) : (
                <span className="truncate text-muted-foreground">{placeholder}</span>
              )
            ) : (
              <>
                {SelectedIcon && (
                  <SelectedIcon className="h-4 w-4 shrink-0 text-primary" />
                )}
                <span className="truncate">
                  {selectedItem ? selectedItem.label : placeholder}
                </span>
              </>
            )}
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(
          // Follow the trigger's width (Radix sets this var on the content),
          // with a floor so narrow triggers keep the list readable.
          'w-[var(--radix-popover-trigger-width)] min-w-[220px] p-0 z-50',
          // Never taller than the viewport space Radix carves out; the inner
          // CommandList does the scrolling within that budget.
          'max-h-[var(--radix-popover-content-available-height)] overflow-hidden flex flex-col',
          contentClassName
        )}
        align="start"
      >
        {/* min-h-0 lets the Command shrink inside the capped panel so the
            list scrolls instead of being clipped. */}
        <Command className="min-h-0">
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-r border-l border-b dark:border-gray-800">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>

            {normalizedGroups.map((group, gIdx) => (
              <CommandGroup
                key={group.label || `group-${gIdx}`}
                heading={group.label}
              >
                {group.items.map((item) => {
                  const isSelected = multiple
                    ? selectedValues.includes(item.value)
                    : item.value === value;
                  const ItemIcon = item.icon;
                  return (
                    <CommandItem
                      key={item.value}
                      value={`${item.label} ${item.description || ''}`}
                      disabled={item.disabled}
                      onSelect={() => handleSelect(item.value)}
                      className="cursor-pointer py-2"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {ItemIcon ? (
                          <ItemIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        ) : (
                          null
                        )}
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-sm font-medium truncate">
                            {item.label}
                          </span>
                          {item.description && (
                            <span className="text-xs text-muted-foreground truncate">
                              {item.description}
                            </span>
                          )}
                        </div>
                      </div>

                      {item.shortcut && (
                        <CommandShortcut className="ml-2 text-[10px]">
                          {item.shortcut}
                        </CommandShortcut>
                      )}

                      <Check
                        className={cn(
                          'ml-2 h-4 w-4 shrink-0',
                          isSelected ? 'opacity-100 text-primary' : 'opacity-0'
                        )}
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
