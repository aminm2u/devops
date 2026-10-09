import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

export type CalendarView = 'month' | 'week' | 'day';

interface CalendarToolbarProps {
  label: string;
  view: CalendarView;
  onView: (view: CalendarView) => void;
  onNavigate: (action: 'PREV' | 'NEXT' | 'TODAY') => void;
}

/**
 * Custom react-big-calendar toolbar: prev/today/next + range label + view switcher.
 */
export function CalendarToolbar({ label, view, onView, onNavigate }: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onNavigate('PREV')}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" className="h-8" onClick={() => onNavigate('TODAY')}>
          <CalendarDays className="h-3.5 w-3.5 mr-1.5" /> Today
        </Button>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onNavigate('NEXT')}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="text-sm font-semibold">{label}</div>

      <div className="ml-auto">
        <Select value={view} onValueChange={(v) => onView(v as CalendarView)}>
          <SelectTrigger className="w-[110px] h-8 text-xs">
            <SelectValue placeholder="View" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">Month</SelectItem>
            <SelectItem value="week">Week</SelectItem>
            <SelectItem value="day">Day</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
