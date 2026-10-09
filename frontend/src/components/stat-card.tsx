import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  caption?: string;
  icon?: LucideIcon;
  /** e.g. 'text-purple-500' */
  iconClassName?: string;
  /** Tone for the number, e.g. 'text-red-600' */
  valueClassName?: string;
  /** stacked = label above value (default) · inline = label left / value right */
  layout?: 'stacked' | 'inline';
  /** Render the value inside a rounded chip */
  pill?: boolean;
  className?: string;
}

/**
 * KPI/stat card. Wrap a group of them in a grid at the call site
 * (e.g. `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`).
 */
export function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  iconClassName,
  valueClassName,
  layout = 'stacked',
  pill,
  className,
}: StatCardProps) {
  const valueNode = pill ? (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-muted px-3 py-1 text-xl font-bold',
        valueClassName
      )}
    >
      {value}
    </span>
  ) : (
    <span className={cn('text-2xl font-bold', valueClassName)}>{value}</span>
  );

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        {layout === 'inline' ? (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{label}</span>
            {valueNode}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">{label}</p>
              {valueNode}
              {caption && <p className="text-xs text-muted-foreground">{caption}</p>}
            </div>
            {Icon && <Icon className={cn('h-8 w-8 shrink-0', iconClassName)} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
