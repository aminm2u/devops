import { Badge } from '@/components/ui/badge';
import type { TimeEntryStatus } from '@/types';

const STATUS_STYLES: Record<TimeEntryStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  submitted: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
  approved: 'bg-green-500/15 text-green-500 border-green-500/30',
  rejected: 'bg-red-500/15 text-red-500 border-red-500/30',
};

export function EntryStatusBadge({ status }: { status: string }) {
  const key = status as TimeEntryStatus;
  return (
    <Badge
      variant="outline"
      className={`text-[9px] px-1.5 py-0 capitalize ${STATUS_STYLES[key] || STATUS_STYLES.draft}`}
    >
      {status}
    </Badge>
  );
}
