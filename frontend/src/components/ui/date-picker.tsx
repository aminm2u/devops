import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  placeholder?: string;
}

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function DatePicker({ value, onChange, placeholder }: DatePickerProps) {
  // Parse current value
  const date = value ? new Date(value + 'T00:00:00') : null;
  const day = date ? date.getDate() : null;
  const month = date ? date.getMonth() + 1 : null;
  const year = date ? date.getFullYear() : null;

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 11 }, (_, i) => currentYear - 5 + i);
  const daysInMonth = month && year ? getDaysInMonth(year, month) : 31;
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const handleChange = (type: 'day' | 'month' | 'year', val: string) => {
    let newDay = day;
    let newMonth = month;
    let newYear = year;

    if (type === 'day') newDay = parseInt(val);
    if (type === 'month') newMonth = parseInt(val);
    if (type === 'year') newYear = parseInt(val);

    // Only call onChange when all three values are selected
    if (newDay && newMonth && newYear) {
      // Adjust day if it exceeds days in new month
      const maxDays = getDaysInMonth(newYear, newMonth);
      if (newDay > maxDays) newDay = maxDays;
      const dateStr = `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
      onChange(dateStr);
    }
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="flex gap-2">
      <Select
        value={day ? String(day) : undefined}
        onValueChange={(v) => handleChange('day', v)}
      >
        <SelectTrigger className="w-[70px]">
          <SelectValue placeholder="dd" />
        </SelectTrigger>
        <SelectContent>
          {days.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {String(d).padStart(2, '0')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={month ? String(month) : undefined}
        onValueChange={(v) => handleChange('month', v)}
      >
        <SelectTrigger className="w-[110px]">
          <SelectValue placeholder="mm" />
        </SelectTrigger>
        <SelectContent>
          {months.map((m, i) => (
            <SelectItem key={i + 1} value={String(i + 1)}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={year ? String(year) : undefined}
        onValueChange={(v) => handleChange('year', v)}
      >
        <SelectTrigger className="w-[85px]">
          <SelectValue placeholder="yyyy" />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="px-2 text-sm text-muted-foreground hover:text-foreground"
        >
          ✕
        </button>
      )}
    </div>
  );
}
