import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronsDownUp,
  ChevronsUpDown,
  History,
  ListTree,
  Plus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import { EmptyState } from '@/components/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import type { ScopeItem } from '@/api/scope';
import {
  canMove,
  filterScopeTree,
  scopeRowMeta,
  visibleScopeNodes,
  type ScopeNode,
} from './derive';
import { COST_COL, ScopeRow } from './ScopeRow';
import { BaselinesDialog } from './BaselinesDialog';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'planned', label: 'Planned' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
] as const;

/**
 * The scope tree.
 *
 * Rows render flat from `visibleScopeNodes` (the depth-first order with
 * collapsed subtrees pruned), not from a recursive component — that keeps the
 * render order, the keyboard walk and the filter result describing the same
 * list, and lets the roving tabindex move by index.
 *
 * Costs are read-only here; they come from the Costing Sheet tab.
 */
export function ScopeTree({
  projectId,
  items,
  tree,
  canEdit,
  isLoading = false,
  onAddChild,
  onAddSibling,
  onEdit,
  onDelete,
  onMove,
}: {
  projectId: number;
  items: ScopeItem[];
  tree: ScopeNode[];
  canEdit: boolean;
  isLoading?: boolean;
  onAddChild: (parentId: number) => void;
  onAddSibling: (afterSiblingId: number, parentId: number | null) => void;
  onEdit: (id: number) => void;
  onDelete: (id: number, title: string) => void;
  onMove: (id: number, direction: 'up' | 'down') => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({});
  const [baselinesOpen, setBaselinesOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ScopeItem['status'] | 'all'>('all');
  const [activeId, setActiveId] = useState<number | null>(null);

  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const treeRef = useRef<HTMLDivElement>(null);

  const filter = useMemo(
    () => filterScopeTree(tree, { query, status }),
    [tree, query, status]
  );
  const filtering = query.trim() !== '' || status !== 'all';

  const visible = useMemo(
    () => visibleScopeNodes(filter.tree, collapsed, filter.forcedOpenIds),
    [filter.tree, collapsed, filter.forcedOpenIds]
  );
  const rowMeta = useMemo(() => scopeRowMeta(visible), [visible]);

  // Keep the roving-tabindex target legal as the visible set changes (filter,
  // collapse, delete). Without this, focus can point at a row that is gone and
  // the tree loses its single tab stop.
  useEffect(() => {
    if (visible.length === 0) {
      if (activeId !== null) setActiveId(null);
      return;
    }
    if (activeId == null || !visible.some((n) => n.item.id === activeId)) {
      setActiveId(visible[0].item.id);
    }
  }, [visible, activeId]);

  const toggle = useCallback((id: number) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const focusRow = (id: number) => {
    setActiveId(id);
    rowRefs.current.get(id)?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((n) => n.item.id === activeId);
    if (index === -1) return;
    const node = visible[index];

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (index < visible.length - 1) focusRow(visible[index + 1].item.id);
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (index > 0) focusRow(visible[index - 1].item.id);
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (node.children.length > 0 && collapsed[node.item.id]) toggle(node.item.id);
        else if (node.children.length > 0) focusRow(node.children[0].item.id);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        if (node.children.length > 0 && !collapsed[node.item.id]) toggle(node.item.id);
        else if (node.item.parentId != null) focusRow(node.item.parentId);
        break;
      case 'Home':
        event.preventDefault();
        focusRow(visible[0].item.id);
        break;
      case 'End':
        event.preventDefault();
        focusRow(visible[visible.length - 1].item.id);
        break;
      case 'Enter':
        if (canEdit) {
          event.preventDefault();
          onEdit(node.item.id);
        }
        break;
      case ' ':
        if (node.children.length > 0) {
          // Prevent the page from scrolling under the tree.
          event.preventDefault();
          toggle(node.item.id);
        }
        break;
      default:
        break;
    }
  };

  /** Every id that has children — the set expand/collapse-all operates on. */
  const parentIds = useMemo(() => {
    const ids: number[] = [];
    const walk = (list: ScopeNode[]) => {
      for (const node of list) {
        if (node.children.length > 0) ids.push(node.item.id);
        walk(node.children);
      }
    };
    walk(tree);
    return ids;
  }, [tree]);

  const expandAll = () => setCollapsed({});
  const collapseAll = () =>
    setCollapsed(Object.fromEntries(parentIds.map((id) => [id, true])));

  const clearFilters = () => {
    setQuery('');
    setStatus('all');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListTree className="h-4 w-4 text-muted-foreground" />
          Scope of Work
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setBaselinesOpen(true)}>
            <History className="mr-2 h-4 w-4" />
            Baselines
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => onAddSibling(-1, null)} disabled={isLoading}>
              <Plus className="mr-2 h-4 w-4" />
              Add Root Item
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Toolbar — scoped to this tree, so it sits inside the card. */}
        {items.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title, WBS, assignee…"
                className="h-8 pl-9 text-sm"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as ScopeItem['status'] | 'all')}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={expandAll}
                aria-label="Expand all items"
              >
                <ChevronsUpDown className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={collapseAll}
                aria-label="Collapse all items"
              >
                <ChevronsDownUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Filter feedback: a count plus a way out, announced for screen readers. */}
        {filtering && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span role="status">
              {filter.matchCount} of {items.length} items match
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearFilters}>
              <X className="mr-1 h-3 w-3" /> Clear
            </Button>
          </div>
        )}

        {/* Column header — keeps the cost rail honest. */}
        {!isLoading && visible.length > 0 && (
          <div className="hidden items-center justify-end gap-2 px-2 text-[10px] uppercase tracking-wide text-muted-foreground sm:flex">
            <span className={cn(COST_COL, 'pr-2')}>Plan / actual</span>
            {canEdit && <span className="w-[60px] shrink-0" aria-hidden />}
          </div>
        )}

        {isLoading ? (
          <LoadingState variant="panel" label="Loading scope…" />
        ) : tree.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70">
            <EmptyState
              icon={ListTree}
              title="No scope defined yet"
              description="Add the first phase or activity to start the work breakdown."
              action={
                canEdit ? (
                  <Button onClick={() => onAddSibling(-1, null)}>
                    <Plus className="mr-2 h-4 w-4" /> Add Root Item
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            size="sm"
            icon={ListTree}
            title="No matching items"
            description="Nothing matches the current search and filter."
            action={
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <div
            ref={treeRef}
            role="tree"
            aria-label="Scope of work"
            className="group/tree -mx-2"
            onKeyDown={handleKeyDown}
          >
            {visible.map((node) => {
              const hasChildren = node.children.length > 0;
              const meta = rowMeta.get(node.item.id);
              return (
                <ScopeRow
                  key={node.item.id}
                  node={node}
                  ancestorHasMore={meta?.ancestorHasMore ?? []}
                  isLast={meta?.isLast ?? true}
                  hasChildren={hasChildren}
                  isCollapsed={!!collapsed[node.item.id]}
                  canEdit={canEdit}
                  canMoveUp={canEdit && canMove(tree, node.item.id, 'up')}
                  canMoveDown={canEdit && canMove(tree, node.item.id, 'down')}
                  highlighted={filter.matchedIds.has(node.item.id)}
                  active={activeId === node.item.id}
                  rowRef={(el) => {
                    if (el) rowRefs.current.set(node.item.id, el);
                    else rowRefs.current.delete(node.item.id);
                  }}
                  onToggle={() => toggle(node.item.id)}
                  onEdit={() => onEdit(node.item.id)}
                  onAddChild={() => onAddChild(node.item.id)}
                  onAddSibling={() => onAddSibling(node.item.id, node.item.parentId)}
                  onDelete={() => onDelete(node.item.id, node.item.title)}
                  onMove={(direction) => onMove(node.item.id, direction)}
                  onActivate={() => setActiveId(node.item.id)}
                />
              );
            })}
          </div>
        )}
      </CardContent>

      <BaselinesDialog
        open={baselinesOpen}
        onOpenChange={setBaselinesOpen}
        projectId={projectId}
        canEdit={canEdit}
        currentItems={items}
      />
    </Card>
  );
}
