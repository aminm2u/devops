import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FormGridProps {
  /** 1 | 2 | 3 columns; default 2 (the codebase convention) */
  columns?: 1 | 2 | 3;
  className?: string;
  children: ReactNode;
}

/**
 * Two-column form layout inside dialogs. Use with FormField children
 * instead of hand-writing `grid grid-cols-2 gap-4`.
 */
export function FormGrid({ columns = 2, className, children }: FormGridProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-2',
        columns === 3 && 'grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
}
