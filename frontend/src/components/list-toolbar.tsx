import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface ListToolbarProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Filter selects etc., rendered after the search input; set your own widths */
  children?: ReactNode;
  className?: string;
}

/**
 * Search + filters row for list pages. Controlled — the page owns the
 * state (and should reset its page index in onSearchChange).
 */
export function ListToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  children,
  className,
}: ListToolbarProps) {
  return (
    <div className={cn('flex flex-col gap-3 sm:flex-row', className)}>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="pl-9"
        />
      </div>
      {children}
    </div>
  );
}
