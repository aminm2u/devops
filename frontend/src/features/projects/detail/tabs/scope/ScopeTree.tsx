import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronUp, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';
import { formatMYR } from '@/lib/format';
import type { ScopeNode } from './derive';
import { SCOPE_STATUS_STYLES } from './derive';

/**
 * The scope tree. Rows indent by depth (like the workbook's WBS column) and
 * carry their server-computed cost rollup — that number is read-only here; it
 * changes from the Costing Sheet tab.
 */
export function ScopeTree({
  tree,
  canEdit,
  isLoading = false,
  onAddChild,
  onAddSibling,
  onEdit,
  onDelete,
  onMove,
}: {
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Scope of Work</CardTitle>
        {canEdit && (
          <Button size="sm" onClick={() => onAddSibling(-1, null)} disabled={isLoading}>
            <Plus className="mr-2 h-4 w-4" />
            Add Root Item
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading && <p className="py-8 text-center text-sm text-muted-foreground">Loading scope…</p>}
        {!isLoading && tree.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No scope defined yet — add the first phase or activity.
          </p>
        )}
        {renderLevel(tree, {
          canEdit,
          collapsed,
          toggle: (id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] })),
          onAddChild,
          onAddSibling,
          onEdit,
          onDelete,
          onMove,
        })}
      </CardContent>
    </Card>
  );
}

function renderLevel(
  nodes: ScopeNode[],
  ctx: {
    canEdit: boolean;
    collapsed: Record<number, boolean>;
    toggle: (id: number) => void;
    onAddChild: (parentId: number) => void;
    onAddSibling: (afterSiblingId: number, parentId: number | null) => void;
    onEdit: (id: number) => void;
    onDelete: (id: number, title: string) => void;
    onMove: (id: number, direction: 'up' | 'down') => void;
  }
): React.ReactNode[] {
  return nodes.map((node) => {
    const { item, children, depth } = node;
    const hasChildren = children.length > 0;
    const isCollapsed = ctx.collapsed[item.id];

    return (
      <div key={item.id} className="relative" style={{ marginLeft: depth > 0 ? 24 : 0 }}>
        {/* Horizontal elbow from the parent's vertical guide into this row.
            The vertical guide itself is drawn by the parent's children
            container, so a collapsed parent hides its subtree's lines. */}
        {depth > 0 && (
          <span className="absolute h-px bg-border" style={{ left: -16, top: 17, width: 16 }} />
        )}
        <div
          className={`group flex items-start gap-2 rounded-md border border-transparent px-2 py-1.5 hover:bg-muted/40 ${
            ctx.canEdit ? 'cursor-pointer' : ''
          }`}
          onClick={() => ctx.canEdit && ctx.onEdit(item.id)}
          role={ctx.canEdit ? 'button' : undefined}
          aria-label={ctx.canEdit ? `Edit ${item.title}` : undefined}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                ctx.toggle(item.id);
              }}
              className="mt-0.5 text-muted-foreground hover:text-foreground"
              aria-label={isCollapsed ? 'Expand' : 'Collapse'}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          ) : (
            // <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/50" />
            <></>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs font-medium">{item.wbsNumber}</span>
              <span className="text-sm font-medium">{item.title}</span>
              <Badge variant="outline" className={SCOPE_STATUS_STYLES[item.status]}>
                {item.status.replace('_', ' ')}
              </Badge>
              {(item.roleCodes ?? []).map((code) => (
                <Badge key={code} variant="secondary" className="font-mono text-[10px]">
                  {code}
                </Badge>
              ))}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {item.startDate && <span>{formatDate(item.startDate)}</span>}
              {item.endDate && <span>→ {formatDate(item.endDate)}</span>}
              {item.assignee && <span>· {item.assignee.name}</span>}
              {item.progress != null && <span>· {item.progress}%</span>}
              <span className="font-medium text-foreground/80">{formatMYR(item.planCost)}</span>
            </div>
            {item.description && <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.description}</p>}
          </div>

          {ctx.canEdit && (
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              {hasChildren && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    ctx.toggle(item.id);
                  }}
                  aria-label="Toggle children"
                >
                  {isCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onMove(item.id, 'up');
                }}
                aria-label="Move up"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onMove(item.id, 'down');
                }}
                aria-label="Move down"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onAddChild(item.id);
                }}
                aria-label="Add child"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onAddSibling(item.id, item.parentId);
                }}
                aria-label="Add sibling below"
              >
                <Plus className="h-3.5 w-3.5 rotate-45" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onEdit(item.id);
                }}
                aria-label="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={(e) => {
                  e.stopPropagation();
                  ctx.onDelete(item.id, item.title);
                }}
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          )}
        </div>
        {hasChildren && !isCollapsed && (
          <div className="relative">
            {/* The vertical guide spanning the children block, drawn at the
                parent's indent so each child's elbow meets it. */}
            <span className="absolute top-0 bottom-0 w-px bg-border" style={{ left: -16 }} />
            {renderLevel(children, ctx)}
          </div>
        )}
      </div>
    );
  });
}
