import type { ReactNode } from 'react';
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatMYR, formatMoneyCompact } from '@/lib/format';
import { cn, formatDate } from '@/lib/utils';
import type { ScopeNode } from './derive';

/** Shared with the column-header strip in ScopeTree so they cannot drift. */
export const COST_COL = 'w-32 shrink-0 text-right sm:w-36';
export const CHEVRON_COL = 'w-5 shrink-0';
const GUIDE_W = 20; // px per indent level

/**
 * One WBS row.
 *
 * Three zones: indent guides → chevron → identity (with a meta line under it),
 * then a right-aligned cost rail and the action affordances. Costs align in a
 * column down the whole tree, which is the point — a per-row `MYR 0.00` wall
 * would defeat it, so a zero-cost row shows a single muted dash.
 *
 * Parent/leaf, depth and collapsed state come from the caller; this component
 * is presentational and reports intent through the callbacks.
 */
export function ScopeRow({
  node,
  ancestorHasMore,
  isLast,
  hasChildren,
  isCollapsed,
  canEdit,
  canMoveUp,
  canMoveDown,
  highlighted,
  active,
  rowRef,
  onToggle,
  onEdit,
  onAddChild,
  onAddSibling,
  onDelete,
  onMove,
  onActivate,
}: {
  node: ScopeNode;
  /** One flag per ancestor level: does that ancestor have a sibling below it?
   *  A rail is only drawn while the answer is yes — drawing it past the last
   *  child is what makes a tree diagram wrong. */
  ancestorHasMore: boolean[];
  isLast: boolean;
  hasChildren: boolean;
  isCollapsed: boolean;
  canEdit: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Row matched the current search/filter directly. */
  highlighted: boolean;
  /** Roving-tabindex current row. */
  active: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  onToggle: () => void;
  onEdit: () => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDelete: () => void;
  onMove: (direction: 'up' | 'down') => void;
  onActivate: () => void;
}) {
  const { item, depth } = node;
  const plan = Number(item.planCost ?? 0);
  const actual = Number(item.actualCost ?? 0);
  const hasMoney = plan > 0 || actual > 0;
  const over = actual > plan;
  const variance = plan - actual;

  const meta = buildMeta(node);

  return (
    <div
      ref={rowRef}
      role="treeitem"
      aria-level={depth + 1}
      aria-expanded={hasChildren ? !isCollapsed : undefined}
      tabIndex={active ? 0 : -1}
      onFocus={onActivate}
      className="group/treeitem outline-none"
    >
      <div
        onClick={() => canEdit && onEdit()}
        className={cn(
          'flex items-start gap-2 rounded-md pr-2 transition-colors',
          'group-focus-visible/treeitem:ring-2 group-focus-visible/treeitem:ring-inset group-focus-visible/treeitem:ring-ring',
          canEdit && 'cursor-pointer',
          depth === 0
            ? 'mt-1 border border-border/40 bg-muted/40 py-2.5'
            : depth === 1
              ? 'py-2 hover:bg-muted/40'
              : 'py-1.5 hover:bg-muted/40',
          // Only while the tree actually holds focus — otherwise the first row
          // wears a highlight ring at rest and reads as selected.
          active &&
            'group-focus-within/tree:ring-1 group-focus-within/tree:ring-inset group-focus-within/tree:ring-primary/30',
          highlighted && 'bg-primary/5'
        )}
        style={{ paddingLeft: depth > 0 ? 8 : 10 }}
      >
        {/* Indent guides — one column per ancestor level, drawn per row so
            filtering/collapsing can never desync them. */}
        {depth > 0 && (
          <span className="flex shrink-0 self-stretch" aria-hidden>
            {Array.from({ length: depth }).map((_, level) => {
              const deepest = level === depth - 1;
              // Past the last sibling there is nothing below, so that rail
              // stops at the elbow rather than running on into empty space.
              const hasMore = deepest ? !isLast : ancestorHasMore[level] !== false;
              return (
                <span
                  key={level}
                  className="relative shrink-0 self-stretch"
                  style={{ width: GUIDE_W }}
                >
                  {hasMore && (
                    <span className="absolute left-2.5 inset-y-0 w-px bg-muted-foreground/25" />
                  )}
                  {deepest && (
                    <span className="absolute left-2.5 top-1/2 h-px w-2.5 bg-muted-foreground/25" />
                  )}
                </span>
              );
            })}
          </span>
        )}

        {/* Chevron slot. Leaves keep a spacer so every WBS chip lines up. */}
        <span className={cn(CHEVRON_COL, 'mt-0.5 flex justify-center')}>
          {hasChildren ? (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <ChevronGlyph collapsed={isCollapsed} />
            </button>
          ) : (
            <span className="block h-4 w-4" aria-hidden />
          )}
        </span>

        {/* Identity */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span
              className={cn(
                'rounded px-1.5 py-0.5 font-mono text-[11px] font-medium',
                depth === 0
                  ? 'border border-primary/20 bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {item.wbsNumber}
            </span>
            <span
              className={cn(
                'truncate',
                depth === 0
                  ? 'text-sm font-semibold text-foreground'
                  : depth === 1
                    ? 'text-sm font-medium text-foreground/90'
                    : 'text-[13px] text-foreground/85'
              )}
            >
              {item.title}
            </span>
            <StatusBadge domain="projectScope" value={item.status} />
            {(item.roleCodes ?? []).map((code) => (
              <Badge key={code} variant="secondary" className="font-mono text-[10px]">
                {code}
              </Badge>
            ))}
          </div>
          {meta && (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
              {meta}
            </p>
          )}
          {depth <= 1 && item.description && (
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground/80">
              {item.description}
            </p>
          )}
        </div>

        {/* Cost rail — aligned, compact; exact figure on hover. */}
        <div className={cn(COST_COL, 'pt-0.5')}>
          {hasMoney ? (
            <>
              <span
                className="block text-sm font-medium tabular-nums"
                title={`Plan ${formatMYR(plan)}`}
              >
                <span className="text-[10px] font-normal text-muted-foreground">MYR </span>
                {formatMoneyCompact(plan)}
              </span>
              <span
                className={cn(
                  'mt-0.5 block text-[11px] tabular-nums',
                  over ? 'text-destructive' : 'text-muted-foreground'
                )}
                title={
                  over
                    ? `Actual ${formatMYR(actual)} — over plan by ${formatMYR(Math.abs(variance))}`
                    : `Actual ${formatMYR(actual)} — ${formatMYR(variance)} remaining`
                }
              >
                {/* Nothing spent yet: "0 · 13k left" reads like a broken sum.
                    Say it plainly instead. */}
                {actual === 0
                  ? 'nothing spent'
                  : `${formatMoneyCompact(actual)} · ${
                      over
                        ? `${formatMoneyCompact(Math.abs(variance))} over`
                        : `${formatMoneyCompact(variance)} left`
                    }`}
              </span>
            </>
          ) : (
            <span className="block text-sm text-muted-foreground/60" title="No cost lines linked">
              —
            </span>
          )}
        </div>

        {/* Actions: one quick add-child plus a labelled menu.
            The row wrapper declares a NAMED group (`group/treeitem`), so the
            variants must be named too — a bare `group-hover:` matches nothing
            here and the buttons stayed invisible. Kept faintly visible at rest
            so they are discoverable without hovering to find them. */}
        {canEdit && (
          <div
            className="flex shrink-0 items-center gap-0.5 self-start opacity-40 transition-opacity focus-within:opacity-100 group-hover/treeitem:opacity-100 group-focus-within/treeitem:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              aria-label={`Add sub-item to ${item.title}`}
              onClick={onAddChild}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-haspopup="menu"
                  aria-label={`Actions for ${item.wbsNumber} ${item.title}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onSelect={onAddChild}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> Add sub-item
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onAddSibling}>
                  <Plus className="mr-2 h-3.5 w-3.5" /> Add item below
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveUp} onSelect={() => onMove('up')}>
                  <ArrowUp className="mr-2 h-3.5 w-3.5" /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!canMoveDown} onSelect={() => onMove('down')}>
                  <ArrowDown className="mr-2 h-3.5 w-3.5" /> Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={onDelete}
                >
                  <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>
    </div>
  );
}

/** Meta line: only facts that exist, joined by middots, never a comma soup. */
function buildMeta(node: ScopeNode): ReactNode {
  const { item, children } = node;
  const parts: ReactNode[] = [];

  if (item.startDate || item.endDate) {
    const start = item.startDate ? formatDate(item.startDate) : '—';
    const end = item.endDate ? formatDate(item.endDate) : '—';
    parts.push(<span key="dates">{start} → {end}</span>);
  }
  if (item.assignee) parts.push(<span key="assignee">{item.assignee.name}</span>);
  if (children.length > 0) {
    parts.push(<span key="sub">{children.length} sub-item{children.length === 1 ? '' : 's'}</span>);
  }
  if (!!item.taskCount) {
    parts.push(
      <span key="tasks">
        {item.doneTaskCount ?? 0}/{item.taskCount} task{item.taskCount === 1 ? '' : 's'}
      </span>
    );
  }
  if (!!item.loggedHours) {
    const hours = Number(item.loggedHours);
    parts.push(
      <span key="hours" className="font-medium text-foreground/80">
        {Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0$/, '')}h logged
      </span>
    );
  }
  if (item.progress != null) {
    parts.push(<span key="progress">{item.progress}%</span>);
  }

  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((part, index) => (
        <span key={index} className="inline-flex items-center gap-1.5">
          {index > 0 && <span aria-hidden>·</span>}
          {part}
        </span>
      ))}
    </>
  );
}

function ChevronGlyph({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {collapsed ? <path d="m9 18 6-6-6-6" /> : <path d="m6 9 6 6 6-6" />}
    </svg>
  );
}
