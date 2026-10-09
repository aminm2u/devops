import { Badge } from '@/components/ui/badge';
import { Timer, ListTodo } from 'lucide-react';
import { EntryStatusBadge } from './EntryStatusBadge';
import type { TimeEntry } from '@/types';

interface EntryCardProps {
  entry: TimeEntry;
  onClick: (entry: TimeEntry) => void;
  showUser?: boolean;
}

/**
 * Compact timesheet entry card used in the week grid and calendar fallback.
 * Source chip: task title / "Parent › Subtask" / Ad-hoc + category.
 */
export function EntryCard({ entry, onClick, showUser = false }: EntryCardProps) {
  const sourceLabel =
    entry.sourceLabel ??
    (entry.subtask
      ? `${entry.task?.title ?? ''} › ${entry.subtask.title}`
      : entry.task
        ? entry.task.title
        : 'Ad-hoc');

  const isTaskLinked = !!(entry.taskId || entry.subtaskId);

  return (
    <button
      type="button"
      onClick={() => onClick(entry)}
      className="w-full text-left bg-card border border-border/50 rounded-lg p-2 hover:border-primary/40 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 gap-1 border-primary/30 text-primary shrink-0">
          <Timer className="h-2.5 w-2.5" />
          {Number(entry.hours)}h
        </Badge>
        <EntryStatusBadge status={entry.status} />
        <span className="ml-auto text-[9px] text-muted-foreground capitalize">{entry.categoryValue}</span>
      </div>
      <p className="text-xs leading-snug line-clamp-2 text-foreground/90">{entry.description}</p>
      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
        <ListTodo className="h-2.5 w-2.5 shrink-0" />
        <span className={`truncate ${isTaskLinked ? 'text-primary/80' : ''}`}>{sourceLabel}</span>
      </div>
      {showUser && entry.user && (
        <div className="text-[10px] text-muted-foreground mt-1 truncate">{entry.user.name}</div>
      )}
    </button>
  );
}
