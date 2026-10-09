import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface LoadingStateProps {
  /** screen = full viewport (route guards) · page = tall block · panel = inside cards · inline = single row */
  variant?: 'screen' | 'page' | 'panel' | 'inline';
  label?: string;
  className?: string;
}

const variants = {
  screen: { wrapper: 'flex h-screen w-full items-center justify-center', spinner: 'h-8 w-8' },
  page: { wrapper: 'flex h-64 w-full items-center justify-center', spinner: 'h-8 w-8' },
  panel: { wrapper: 'flex w-full items-center justify-center py-12', spinner: 'h-6 w-6' },
  inline: { wrapper: 'inline-flex items-center gap-2 text-sm text-muted-foreground', spinner: 'h-4 w-4' },
} as const;

/**
 * Standard loading indicator. Use instead of hand-rolled spinner divs —
 * screen for route guards, page for full-page queries, panel inside
 * cards/tables, inline next to text.
 */
export function LoadingState({ variant = 'panel', label, className }: LoadingStateProps) {
  const v = variants[variant];
  const stacked = Boolean(label) && variant !== 'inline';
  return (
    <div
      className={cn(v.wrapper, stacked && 'flex-col gap-2', className)}
      role="status"
      aria-live="polite"
    >
      <Loader2 className={cn('shrink-0 animate-spin text-primary', v.spinner)} />
      {label && <span>{label}</span>}
    </div>
  );
}
