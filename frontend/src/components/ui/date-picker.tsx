import * as React from 'react';
import { CalendarDays, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, toLocalDateStr } from '@/lib/utils';

export interface DatePickerProps {
  /** 'YYYY-MM-DD' local date, or '' when unset. */
  value: string;
  onChange: (value: string) => void;
  /** Trigger placeholder when value is empty. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "13 Oct 2026" — matches DateTimePicker's trigger display. */
function formatDisplay(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const monthName = MONTHS[m - 1] || '';
  return `${d} ${monthName} ${y}`;
}

/**
 * Calendar-popover date picker.
 *
 * Keeps the long-standing string contract (`value` is `YYYY-MM-DD`, `''` = unset)
 * so existing call sites need no changes. Timesheet-safe: parses at local
 * midnight and emits via `toLocalDateStr`, never `toISOString()`.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  className,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Local-midnight Date, so the right cell highlights in every timezone.
  const selected = React.useMemo(
    () => (value ? new Date(value + 'T00:00:00') : undefined),
    [value]
  );

  const handleSelect = (day: Date | undefined) => {
    // DayPicker toggles to undefined when re-clicking the selected day —
    // treat that as a no-op so an accidental double-click can't wipe the field.
    if (!day) return;
    onChange(toLocalDateStr(day));
    setOpen(false);
  };

  const handleToday = () => {
    onChange(toLocalDateStr(new Date()));
    setOpen(false);
  };

  const handleClear = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    onChange('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          role="combobox"
          aria-expanded={open}
          className={cn(
            // `flex` (not the Button default `inline-flex`): this trigger is a
            // form control and must be block-level like Input/SelectTrigger.
            // Inline-level boxes don't collapse margins with the Label above,
            // so inline-flex would double the label-to-control gap.
            'flex h-9 w-full justify-between px-3 text-left font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {value ? formatDisplay(value) : placeholder}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0 ml-2">
            {value && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClear(e);
                  }
                }}
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                title="Clear date"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>

      {/* p-0: the Calendar owns its own p-3, so this would otherwise double up */}
      <PopoverContent className="z-50 w-[300px] p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected ?? new Date()}
          disabled={disabled}
        />
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleToday}
            className="h-7 px-2 text-xs text-primary hover:text-primary"
          >
            Today
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
