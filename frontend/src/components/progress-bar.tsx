import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** sm = h-2 (default) · md = h-4 */
  size?: 'sm' | 'md';
  /** 'auto' = threshold colors (green→yellow→orange→red) · 'primary' · or an explicit bg-* class */
  tone?: 'auto' | 'primary' | string;
  /** Percent text inside the fill (md only) */
  showLabel?: boolean;
  className?: string;
}

/** Threshold colors matching the budget utilization bar convention. */
function autoTone(percent: number): string {
  if (percent >= 100) return 'bg-red-500';
  if (percent >= 80) return 'bg-orange-500';
  if (percent >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

/**
 * Determinate progress/utilization bar. Use for budget utilization,
 * completion percent, distribution shares etc.
 */
export function ProgressBar({
  value,
  max = 100,
  size = 'sm',
  tone = 'auto',
  showLabel,
  className,
}: ProgressBarProps) {
  const percent = max > 0 ? (value / max) * 100 : 0;
  const clamped = Math.min(100, Math.max(0, percent));
  const fillTone = tone === 'auto' ? autoTone(clamped) : tone === 'primary' ? 'bg-primary' : tone;
  const md = size === 'md';

  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-muted', md ? 'h-4' : 'h-2', className)}>
      <div
        className={cn(
          'h-full rounded-full transition-all',
          fillTone,
          showLabel && md && 'relative flex items-center justify-center'
        )}
        style={{ width: `${clamped}%` }}
      >
        {showLabel && md && (
          <span className="text-[10px] font-semibold text-white">{Math.round(clamped)}%</span>
        )}
      </div>
    </div>
  );
}
