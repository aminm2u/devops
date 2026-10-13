import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Usually a Button; rendered below the text */
  action?: ReactNode;
  /** sm for table-embedded one-liners, md (default) for page/card bodies */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Standard "nothing here" block for empty lists and sections. Use instead
 * of bare muted paragraphs so empty states look the same everywhere.
 */
export function EmptyState({ icon: Icon, title, description, action, size = 'md', className }: EmptyStateProps) {
  const md = size === 'md';
  return (
    <div
      className={cn('flex flex-col items-center justify-center text-center', md ? 'py-12' : 'py-8', className)}
    >
      {Icon && (
        <div
          className={cn(
            'mb-3 flex items-center justify-center rounded-full bg-muted',
            md ? 'h-12 w-12' : 'h-10 w-10'
          )}
        >
          <Icon className={cn('text-muted-foreground', md ? 'h-6 w-6' : 'h-5 w-5')} />
        </div>
      )}
      <p className={md ? 'text-base font-semibold' : 'text-sm font-medium'}>{title}</p>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
