import * as React from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Single-date month-grid calendar (react-day-picker v9/v10 API).
 *
 * Styled entirely through `classNames` — no `react-day-picker/style.css` —
 * using this app's theme tokens so it flips correctly under `.dark`.
 *
 * Day cells render as `td.day > button.day_button`, so modifier classes land
 * on the `<td>` and selection/today fills target the inner button via `[&>button]:`.
 * Note `today` is declared before `selected` so a selected-today reads as selected.
 *
 * Layout notes (these cost a debugging pass — don't "simplify" them away):
 * - `nav` is a sibling of `month`, not a child, so it is absolutely positioned
 *   over the caption row to flank the month label like a normal datepicker.
 * - Rows are `display:flex` with `flex-1` cells. Avoid `root: 'w-fit'` combined
 *   with percentage-width day buttons — it collapses the grid to content width.
 */
export function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('w-full p-3', className)}
      classNames={{
        root: cn('w-full', defaultClassNames.root),
        months: cn('relative flex w-full flex-col', defaultClassNames.months),
        month: cn('w-full space-y-3', defaultClassNames.month),
        // Overlays the caption row (nav is a sibling of month, not a child)
        nav: cn(
          'absolute inset-x-0 top-0 z-10 flex items-center justify-between',
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100',
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-60 hover:opacity-100',
          defaultClassNames.button_next
        ),
        month_caption: cn(
          'flex h-9 items-center justify-center px-9',
          defaultClassNames.month_caption
        ),
        caption_label: cn('text-sm font-medium text-foreground', defaultClassNames.caption_label),
        month_grid: cn('w-full border-collapse', defaultClassNames.month_grid),
        weeks: cn('w-full', defaultClassNames.weeks),
        weekdays: cn('flex w-full', defaultClassNames.weekdays),
        weekday: cn(
          'flex h-8 flex-1 items-center justify-center text-xs font-normal text-muted-foreground',
          defaultClassNames.weekday
        ),
        week: cn('mt-1 flex w-full', defaultClassNames.week),
        day: cn('relative flex h-9 flex-1 items-center justify-center p-0 text-center', defaultClassNames.day),
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-full rounded-md p-0 font-normal aria-selected:opacity-100',
          defaultClassNames.day_button
        ),
        chevron: cn('h-4 w-4', defaultClassNames.chevron),
        footer: cn('text-xs text-muted-foreground', defaultClassNames.footer),
        outside: cn('text-muted-foreground opacity-40', defaultClassNames.outside),
        disabled: cn('text-muted-foreground opacity-50', defaultClassNames.disabled),
        hidden: cn(defaultClassNames.hidden),
        focused: cn(defaultClassNames.focused),
        // `today` must not fight `selected` for the same background: both are
        // arbitrary-variant utilities with equal specificity, so class order
        // does NOT decide the winner — Tailwind's stylesheet order does.
        // Gate `today` on the td not carrying data-selected instead.
        today: cn(
          '[&:not([data-selected])>button]:bg-accent [&:not([data-selected])>button]:font-semibold [&:not([data-selected])>button]:text-accent-foreground',
          defaultClassNames.today
        ),
        selected: cn(
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground',
          defaultClassNames.selected
        ),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className: chevronClass, ...chevronProps }) =>
          orientation === 'left' ? (
            <ChevronLeft className={cn('h-4 w-4', chevronClass)} {...chevronProps} />
          ) : (
            <ChevronRight className={cn('h-4 w-4', chevronClass)} {...chevronProps} />
          ),
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';
