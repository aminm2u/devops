import * as React from 'react';
import { CalendarClock, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface DateTimePickerProps {
  /** 'YYYY-MM-DDTHH:mm' (local time) or '' when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Minute selection increment. Default is 5. */
  minuteStep?: 1 | 5 | 10 | 15 | 30;
  /** Range of years before/after current year to display. Default is 5. */
  yearRange?: number;
  disabled?: boolean;
  className?: string;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDisplay(iso: string): string {
  if (!iso) return '';
  const [datePart, timePart] = iso.split('T');
  if (!datePart || !timePart) return iso;
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const monthName = MONTHS[m - 1] || '';
  return `${d} ${monthName} ${y}, ${timePart}`;
}

/**
 * Select-based date and time picker rendered inside a Popover.
 * Provides day, month, year, hour, and minute Selects in a compact two-row panel.
 * Avoids browser-dependent datetime-local inputs and fits comfortably within modal forms.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = 'Select date & time',
  minuteStep = 5,
  yearRange = 5,
  disabled = false,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse ISO string into parts
  const parsed = React.useMemo(() => {
    if (!value) return null;
    const [datePart, timePart] = value.split('T');
    if (!datePart || !timePart) return null;
    const [y, m, d] = datePart.split('-').map(Number);
    const [hh, mm] = timePart.split(':').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hh) || isNaN(mm)) return null;
    return { year: y, month: m, day: d, hour: hh, minute: mm };
  }, [value]);

  const [draft, setDraft] = React.useState<{
    year: number | null;
    month: number | null;
    day: number | null;
    hour: number | null;
    minute: number | null;
  }>({
    year: parsed?.year ?? null,
    month: parsed?.month ?? null,
    day: parsed?.day ?? null,
    hour: parsed?.hour ?? null,
    minute: parsed?.minute ?? null,
  });

  // Sync draft when value prop changes externally
  React.useEffect(() => {
    setDraft({
      year: parsed?.year ?? null,
      month: parsed?.month ?? null,
      day: parsed?.day ?? null,
      hour: parsed?.hour ?? null,
      minute: parsed?.minute ?? null,
    });
  }, [parsed]);

  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: yearRange * 2 + 1 },
    (_, i) => currentYear - yearRange + i
  );

  const daysInMonth = draft.month && draft.year
    ? getDaysInMonth(draft.year, draft.month)
    : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from(
    { length: Math.ceil(60 / minuteStep) },
    (_, i) => i * minuteStep
  );

  const emitIfComplete = (next: typeof draft) => {
    setDraft(next);
    if (
      next.year !== null &&
      next.month !== null &&
      next.day !== null &&
      next.hour !== null &&
      next.minute !== null
    ) {
      // Clamp day if necessary
      const maxDays = getDaysInMonth(next.year, next.month);
      const safeDay = Math.min(next.day, maxDays);
      const yStr = String(next.year).padStart(4, '0');
      const mStr = String(next.month).padStart(2, '0');
      const dStr = String(safeDay).padStart(2, '0');
      const hStr = String(next.hour).padStart(2, '0');
      const minStr = String(next.minute).padStart(2, '0');
      onChange(`${yStr}-${mStr}-${dStr}T${hStr}:${minStr}`);
    }
  };

  const handleNow = () => {
    const now = new Date();
    const min = Math.floor(now.getMinutes() / minuteStep) * minuteStep;
    const next = {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: now.getHours(),
      minute: min,
    };
    emitIfComplete(next);
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDraft({ year: null, month: null, day: null, hour: null, minute: null });
    onChange('');
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
            // form control and must be block-level like Input/SelectTrigger,
            // otherwise margins don't collapse with the Label above and the
            // label-to-control gap doubles.
            'flex h-9 w-full justify-between px-3 text-left font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <div className="flex items-center gap-2 truncate">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
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
                    handleClear();
                  }
                }}
                className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer"
                title="Clear date and time"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[320px] p-3 space-y-3 z-50" align="start">
        {/* Row 1: Day, Month, Year */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Date
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {/* Day */}
            <Select
              value={draft.day !== null ? String(draft.day) : undefined}
              onValueChange={(v) => emitIfComplete({ ...draft, day: parseInt(v, 10) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Day" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {days.map((d) => (
                  <SelectItem key={d} value={String(d)} className="text-xs">
                    {String(d).padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Month */}
            <Select
              value={draft.month !== null ? String(draft.month) : undefined}
              onValueChange={(v) => {
                const nextMonth = parseInt(v, 10);
                const maxDays = draft.year ? getDaysInMonth(draft.year, nextMonth) : 31;
                const nextDay = draft.day && draft.day > maxDays ? maxDays : draft.day;
                emitIfComplete({ ...draft, month: nextMonth, day: nextDay });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {MONTH_NAMES.map((name, idx) => (
                  <SelectItem key={idx + 1} value={String(idx + 1)} className="text-xs">
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Year */}
            <Select
              value={draft.year !== null ? String(draft.year) : undefined}
              onValueChange={(v) => {
                const nextYear = parseInt(v, 10);
                const maxDays = draft.month ? getDaysInMonth(nextYear, draft.month) : 31;
                const nextDay = draft.day && draft.day > maxDays ? maxDays : draft.day;
                emitIfComplete({ ...draft, year: nextYear, day: nextDay });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)} className="text-xs">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 2: Hour & Minute */}
        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Time (24h)
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {/* Hour */}
            <Select
              value={draft.hour !== null ? String(draft.hour) : undefined}
              onValueChange={(v) => emitIfComplete({ ...draft, hour: parseInt(v, 10) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Hour" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {hours.map((h) => (
                  <SelectItem key={h} value={String(h)} className="text-xs">
                    {String(h).padStart(2, '0')}:00
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Minute */}
            <Select
              value={draft.minute !== null ? String(draft.minute) : undefined}
              onValueChange={(v) => emitIfComplete({ ...draft, minute: parseInt(v, 10) })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Minute" />
              </SelectTrigger>
              <SelectContent className="max-h-[200px]">
                {minutes.map((m) => (
                  <SelectItem key={m} value={String(m)} className="text-xs">
                    :{String(m).padStart(2, '0')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 3: Footer actions */}
        <div className="flex items-center justify-between pt-1 border-t border-border/60">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleNow}
            className="h-7 px-2 text-xs text-primary hover:text-primary"
          >
            Now
          </Button>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => handleClear()}
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
