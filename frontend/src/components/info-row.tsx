import { Children, type ReactNode } from 'react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

export interface InfoRowProps {
  label: string;
  value: ReactNode;
  /** row = label left / value right (default) · stacked = label above value */
  layout?: 'row' | 'stacked';
  className?: string;
}

/**
 * Label/value pair for detail pages and read-only dialogs. Use inside
 * DetailList for the row layout so Separators are handled for you.
 */
export function InfoRow({ label, value, layout = 'row', className }: InfoRowProps) {
  if (layout === 'stacked') {
    return (
      <div className={cn('space-y-1', className)}>
        <p className="text-sm font-semibold">{label}</p>
        <div className="text-sm">{value}</div>
      </div>
    );
  }
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      {/* div (not span) so Badge values are valid HTML */}
      <div className="text-right text-sm font-medium">{value}</div>
    </div>
  );
}

export interface DetailListProps {
  children: ReactNode;
  className?: string;
}

/**
 * Stack of InfoRows (row layout) with Separators in between. Conditional
 * rows (null/false children) are skipped without leaving stray separators.
 */
export function DetailList({ children, className }: DetailListProps) {
  const items = Children.toArray(children);
  return (
    <div className={cn('space-y-3', className)}>
      {items.map((child, i) => (
        <div key={i}>
          {i > 0 && <Separator className="mb-3" />}
          {child}
        </div>
      ))}
    </div>
  );
}
