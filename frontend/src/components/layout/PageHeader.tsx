import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** sm = text-xl (dense pages) · md = text-2xl (default) · lg = text-3xl (reports) */
  size?: 'sm' | 'md' | 'lg';
  /** Optional icon rendered inside the h1 (pairs well with size="lg") */
  icon?: LucideIcon;
  /** Action buttons, rendered on the right (wraps on small screens) */
  children?: ReactNode;
  className?: string;
}

const sizeClasses = {
  sm: 'text-xl font-semibold',
  md: 'text-2xl font-bold',
  lg: 'text-3xl font-bold',
} as const;

/**
 * Standard page header: title + description on the left, actions on the
 * right. Use on every page instead of hand-rolled h1 blocks.
 */
export function PageHeader({ title, description, size = 'md', icon: Icon, children, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div>
        <h1 className={cn('flex items-center gap-2 tracking-tight', sizeClasses[size])}>
          {Icon && <Icon className={size === 'sm' ? 'h-5 w-5' : 'h-7 w-7'} />}
          {title}
        </h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
