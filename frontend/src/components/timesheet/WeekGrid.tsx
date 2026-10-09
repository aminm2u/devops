import { Plus, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EntryCard } from './EntryCard';
import type { TimeEntry } from '@/types';

interface WeekGridProps {
  days: string[]; // 7 x YYYY-MM-DD (Mon-Sun)
  entries: TimeEntry[]; // entries for the week
  onAddEntry: (date: string) => void;
  onOpenEntry: (entry: TimeEntry) => void;
  showUser?: boolean;
}

/**
 * Mon-Sun week grid: one column per day, entry cards stacked, daily totals
 * in the footer, "+ Add" affordance on empty space.
 */
export function WeekGrid({ days, entries, onAddEntry, onOpenEntry, showUser = false }: WeekGridProps) {
  const today = new Date().toISOString().split('T')[0];

  const byDay = (day: string) => entries.filter((e) => e.workDate === day);
  const dayTotal = (day: string) =>
    byDay(day).reduce((sum, e) => sum + Number(e.hours), 0);

  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map((day) => {
        const dayEntries = byDay(day);
        const total = dayTotal(day);
        const date = new Date(day + 'T00:00:00');
        const isToday = day === today;

        return (
          <div
            key={day}
            className={`flex flex-col rounded-xl border min-h-[220px] ${
              isToday ? 'border-primary/50 bg-primary/5' : 'border-border/50 bg-muted/30'
            }`}
          >
            <div className="px-2.5 py-2 border-b border-border/40">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${isToday ? 'text-primary' : ''}`}>
                  {date.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className={`text-xs ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                  {date.getDate()}
                </span>
              </div>
            </div>

            <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto max-h-[320px]">
              {dayEntries.map((e) => (
                <EntryCard key={e.id} entry={e} onClick={onOpenEntry} showUser={showUser} />
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-[11px] text-muted-foreground hover:text-primary"
                onClick={() => onAddEntry(day)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>

            <div className="px-2.5 py-1.5 border-t border-border/40 flex items-center gap-1 text-xs">
              <Timer className="h-3 w-3 text-primary" />
              <span className="font-medium">{total}h</span>
              <span className="text-muted-foreground ml-auto">{dayEntries.length} entries</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
