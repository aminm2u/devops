import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  /** Currently selected value. */
  value?: string;
  onChange: (value: string) => void;
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
  onChange,
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

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  const SelectedIcon = selectedItem?.icon;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal text-left h-9 px-3',
            !selectedItem && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            {SelectedIcon && <SelectedIcon className="h-4 w-4 shrink-0 text-primary" />}
            <span className="truncate">
              {selectedItem ? selectedItem.label : placeholder}
            </span>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn('w-[320px] p-0 z-50', contentClassName)}
        align="start"
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} className="h-9" />
          <CommandList className="max-h-[280px] overflow-y-auto">
            <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
              {emptyMessage}
            </CommandEmpty>

            {normalizedGroups.map((group, gIdx) => (
              <CommandGroup
                key={group.label || `group-${gIdx}`}
                heading={group.label}
              >
                {group.items.map((item) => {
                  const isSelected = item.value === value;
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
                          <div className="w-4 shrink-0" />
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
