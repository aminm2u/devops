import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Maximize2,
  Minus,
  Network,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useReferenceData, toSelectOptions } from '@/hooks/useReferenceData';
import { orgApi, type OrgNode, type OrgTree } from '@/api/org';

/**
 * Organisation chart.
 *
 * The server sends a flat node list with `reportIds`; this page is the only
 * place that turns it into geometry. Layout is a simple tidy tree — a leaf
 * claims one column, a parent is centred over its children — which is enough
 * for a company of this size and needs no drawing library.
 *
 * Re-parenting is drag-and-drop, but the server owns the rule that a move must
 * not close a loop, so the UI never predicts the outcome: it applies the move
 * optimistically only after the request succeeds, and shows the 422 verbatim.
 */

const NODE_WIDTH = 208;
const NODE_HEIGHT = 78;
const GAP_X = 22;
const GAP_Y = 58;

interface Position {
  x: number;
  y: number;
  depth: number;
}

interface Layout {
  positions: Map<number, Position>;
  width: number;
  height: number;
}

/**
 * Tidy layout: children are placed first, then the parent is centred over
 * them. `collapsed` prunes a subtree before it claims any horizontal space.
 */
function buildLayout(
  tree: OrgTree,
  collapsed: Set<number>,
  childrenOf: Map<number, number[]>
): Layout {
  const positions = new Map<number, Position>();
  const placed = new Set<number>();
  let cursor = 0;
  let maxDepth = 0;

  const walk = (id: number, depth: number): number => {
    // A node that is already placed would mean the payload contained a loop;
    // bail out rather than recurse forever.
    if (placed.has(id)) return positions.get(id)!.x + NODE_WIDTH / 2;
    placed.add(id);
    maxDepth = Math.max(maxDepth, depth);

    const kids = collapsed.has(id) ? [] : (childrenOf.get(id) ?? []);
    const y = depth * (NODE_HEIGHT + GAP_Y);

    if (kids.length === 0) {
      const x = cursor;
      cursor += NODE_WIDTH + GAP_X;
      positions.set(id, { x, y, depth });
      return x + NODE_WIDTH / 2;
    }

    const centres = kids.map((kid) => walk(kid, depth + 1));
    const centre = (centres[0] + centres[centres.length - 1]) / 2;
    positions.set(id, { x: centre - NODE_WIDTH / 2, y, depth });
    return centre;
  };

  for (const rootId of tree.rootIds) walk(rootId, 0);

  // Defensive: if the payload ever contained a detached loop, nothing above
  // would reach it. Render those people last rather than drop them silently.
  for (const node of tree.nodes) {
    if (!placed.has(node.id)) walk(node.id, 0);
  }

  return {
    positions,
    width: Math.max(cursor, NODE_WIDTH),
    height: (maxDepth + 1) * NODE_HEIGHT + maxDepth * GAP_Y,
  };
}

/** Stable, readable colour per department — used for the card's spine. */
function departmentColor(departmentId: number | null): string | null {
  if (departmentId == null) return null;
  return `hsl(${(departmentId * 67) % 360} 62% 52%)`;
}

export function OrgChartPage() {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canManage = can('hr.org.manage');

  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState('');
  const [moveError, setMoveError] = useState<string | null>(null);
  const [showDepartments, setShowDepartments] = useState(false);

  const { data: tree, isLoading, error } = useQuery({
    queryKey: ['org', 'tree'],
    queryFn: () => orgApi.getTree(),
  });

  const nodesById = useMemo(() => {
    const map = new Map<number, OrgNode>();
    for (const node of tree?.nodes ?? []) map.set(node.id, node);
    return map;
  }, [tree]);

  const childrenOf = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const node of tree?.nodes ?? []) map.set(node.id, node.reportIds);
    return map;
  }, [tree]);

  const layout = useMemo(
    () => (tree ? buildLayout(tree, collapsed, childrenOf) : null),
    [tree, collapsed, childrenOf]
  );

  const selected = selectedId != null ? nodesById.get(selectedId) ?? null : null;

  const { data: chain } = useQuery({
    queryKey: ['org', 'chain', selectedId],
    queryFn: () => orgApi.getChain(selectedId!),
    enabled: selectedId != null,
    staleTime: 30_000,
  });

  const moveMutation = useMutation({
    mutationFn: ({ userId, managerId }: { userId: number; managerId: number | null }) =>
      orgApi.setManager(userId, managerId),
    onSuccess: () => {
      setMoveError(null);
      queryClient.invalidateQueries({ queryKey: ['org'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Reporting line updated');
    },
    onError: (err: any) => {
      // Cycle rejections are the interesting case — show the server's wording.
      const message =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        'Could not update the reporting line';
      setMoveError(message);
      toast.error(message);
    },
  });

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return null;
    return (tree?.nodes ?? []).filter(
      (node) =>
        node.name.toLowerCase().includes(needle) ||
        node.email.toLowerCase().includes(needle) ||
        (node.positionName ?? '').toLowerCase().includes(needle) ||
        (node.departmentName ?? '').toLowerCase().includes(needle)
    );
  }, [tree, search]);

  const toggleCollapse = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDrop = (targetId: number) => {
    setDropTargetId(null);
    if (draggingId == null || draggingId === targetId) return;
    moveMutation.mutate({ userId: draggingId, managerId: targetId });
    setDraggingId(null);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setCollapsed(new Set());
  };

  if (isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading the organisation…</div>;
  }

  if (error || !tree || !layout) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Network className="mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">Could not load the organisation chart</p>
        <p className="mt-1 text-xs text-muted-foreground">
          You need the “View the organisation chart” permission.
        </p>
      </div>
    );
  }

  const departmentCount = new Set(
    tree.nodes.map((node) => node.departmentId).filter((id): id is number => id != null)
  ).size;

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader
        title="Organisation Chart"
        description="Reporting lines and departments. Drag a person onto another to change who they report to."
        icon={Network}
      >
        <Button variant="outline" onClick={() => setShowDepartments(true)}>
          <Building2 className="mr-2 h-4 w-4" />
          Departments
        </Button>
        <Button variant="outline" onClick={resetView}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset view
        </Button>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">People</p>
              <p className="text-2xl font-semibold">{tree.nodes.length}</p>
            </div>
            <Users className="h-8 w-8 text-muted-foreground/40" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Departments</p>
              <p className="text-2xl font-semibold">{departmentCount}</p>
            </div>
            <Building2 className="h-8 w-8 text-muted-foreground/40" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between pt-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Top of chart</p>
              <p className="truncate text-lg font-semibold">
                {nodesById.get(tree.rootIds[0] ?? -1)?.name ?? '—'}
              </p>
            </div>
            <GitBranch className="h-8 w-8 text-muted-foreground/40" />
          </CardContent>
        </Card>
      </div>

      {moveError && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <span className="mt-0.5 text-destructive">!</span>
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Reporting line not changed</p>
            <p className="text-xs text-muted-foreground">{moveError}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setMoveError(null)}>
            Dismiss
          </Button>
        </div>
      )}

      <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a person…"
                className="h-8 pl-8 text-sm"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))}
                aria-label="Zoom out"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}
                aria-label="Zoom in"
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                aria-label="Fit to screen"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Canvas — click-drag on the background pans, wheel is left alone
              so the page still scrolls normally. */}
          <div
            className={cn(
              'relative h-[calc(100vh-330px)] min-h-[420px] overflow-hidden bg-muted/20',
              canManage && draggingId != null ? 'cursor-grabbing' : 'cursor-grab'
            )}
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              if ((e.target as HTMLElement).closest('[data-org-node]')) return;
              // The drawer blocks outside presses so a second card can be picked
              // without closing it, which leaves the empty canvas as the way to
              // dismiss. Pressing it also starts a pan; a pan that never moves
              // is a click, so both read correctly.
              setSelectedId(null);
              setPointer({ x: e.clientX - pan.x, y: e.clientY - pan.y });
            }}
            onMouseMove={(e) => {
              if (!pointer) return;
              setPan({ x: e.clientX - pointer.x, y: e.clientY - pointer.y });
            }}
            onMouseUp={() => setPointer(null)}
            onMouseLeave={() => setPointer(null)}
          >
            <div
              className="absolute origin-top-left"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <div
                className="relative"
                style={{ width: layout.width, height: layout.height }}
              >
                {/* Connectors first so cards paint on top of them. */}
                <svg
                  className="pointer-events-none absolute inset-0"
                  width={layout.width}
                  height={layout.height}
                >
                  {tree.nodes.map((node) => {
                    const from = layout.positions.get(node.id);
                    if (!from) return null;
                    const kids = collapsed.has(node.id) ? [] : node.reportIds;
                    return kids.map((kidId) => {
                      const to = layout.positions.get(kidId);
                      if (!to) return null;
                      const x1 = from.x + NODE_WIDTH / 2;
                      const y1 = from.y + NODE_HEIGHT;
                      const x2 = to.x + NODE_WIDTH / 2;
                      const y2 = to.y;
                      const mid = y1 + (y2 - y1) / 2;
                      return (
                        <path
                          key={`${node.id}-${kidId}`}
                          d={`M ${x1} ${y1} V ${mid} H ${x2} V ${y2}`}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          className="text-border"
                        />
                      );
                    });
                  })}
                </svg>

                {tree.nodes.map((node) => {
                  const position = layout.positions.get(node.id);
                  if (!position) return null;
                  const childCount = node.reportIds.length;
                  const isCollapsed = collapsed.has(node.id);
                  const isSelected = node.id === selectedId;
                  const isDropTarget = node.id === dropTargetId && node.id !== draggingId;
                  const isMatch = matches?.some((m) => m.id === node.id) ?? false;
                  const spine = departmentColor(node.departmentId);

                  return (
                    <div
                      key={node.id}
                      data-org-node
                      className="absolute"
                      style={{
                        left: position.x,
                        top: position.y,
                        width: NODE_WIDTH,
                        height: NODE_HEIGHT,
                      }}
                    >
                      <div
                        draggable={canManage}
                        onDragStart={(e) => {
                          setDraggingId(node.id);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(node.id));
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTargetId(null);
                        }}
                        onDragOver={(e) => {
                          if (!canManage || draggingId == null) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDropTargetId(node.id);
                        }}
                        onDragLeave={() => {
                          setDropTargetId((current) => (current === node.id ? null : current));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          handleDrop(node.id);
                        }}
                        onClick={() => setSelectedId(node.id)}
                        className={cn(
                          'group relative h-full w-full cursor-pointer rounded-lg border bg-card px-3 py-2 shadow-sm transition',
                          'hover:border-primary/50 hover:shadow-md',
                          isSelected && 'border-primary ring-2 ring-primary/30',
                          isMatch && 'border-amber-400 ring-2 ring-amber-200',
                          isDropTarget && 'border-primary ring-2 ring-primary/60',
                          draggingId === node.id && 'opacity-40'
                        )}
                        style={spine ? { borderLeftColor: spine, borderLeftWidth: 4 } : undefined}
                      >
                        <div className="flex items-start gap-2">
                          <UserAvatar user={node} size="md" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold leading-tight">
                              {node.name}
                            </p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {node.positionName ?? node.departmentName ?? 'No position'}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1 overflow-hidden">
                          {node.roles.slice(0, 1).map((role) => (
                            <Badge
                              key={role}
                              variant="secondary"
                              className="shrink-0 px-1 py-0 text-[9px] font-medium"
                            >
                              {role}
                            </Badge>
                          ))}
                          {node.roles.length > 1 && (
                            <span className="text-[9px] text-muted-foreground">
                              +{node.roles.length - 1}
                            </span>
                          )}
                          {node.departmentCode && (
                            <span
                              className="ml-auto shrink-0 rounded px-1 text-[9px] font-semibold"
                              style={
                                spine
                                  ? { color: spine, backgroundColor: `${spine.replace('hsl', 'hsla').replace(')', ' / 0.12)')}` }
                                  : undefined
                              }
                            >
                              {node.departmentCode}
                            </span>
                          )}
                        </div>

                        {childCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCollapse(node.id);
                            }}
                            className="absolute -bottom-2.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
                            title={isCollapsed ? 'Show reports' : 'Hide reports'}
                          >
                            {isCollapsed ? (
                              <ChevronRight className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        )}
                        {isCollapsed && childCount > 0 && (
                          <span className="absolute -right-1.5 -top-1.5 rounded-full bg-primary px-1.5 text-[9px] font-semibold text-primary-foreground">
                            {childCount}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
            <span>
              {canManage
                ? 'Drag a card onto another to re-parent. Click to inspect.'
                : 'Click a card to inspect the reporting chain.'}
            </span>
            {tree.departments.length > 0 && (
              <div className="hidden items-center gap-2 sm:flex">
                {tree.departments.slice(0, 5).map((dept) => (
                  <span key={dept.id} className="flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: departmentColor(dept.id) ?? undefined }}
                    />
                    {dept.code}
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

      {/* Inspector — a drawer rather than a column, so the chart gets the full
          width until someone is actually picked. It is non-modal and has no
          backdrop: the canvas underneath has to stay clickable, which is how
          you move from one person to the next without dismissing the panel. */}
      <Sheet
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        modal={false}
      >
        <SheetContent
          side="right"
          hideOverlay
          // Without this, clicking a second card reads as an "outside" press and
          // Radix closes the panel — but picking someone else while the drawer
          // is open is the main way to use it.
          onInteractOutside={(e) => e.preventDefault()}
          className="w-full sm:max-w-sm lg:max-w-sm"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 text-sm">
              <UserCheck className="h-4 w-4" />
              {selected?.name ?? 'Person'}
            </SheetTitle>
            {selected && (
              <SheetDescription>
                {selected.positionName ?? selected.departmentName ?? 'No position assigned'}
              </SheetDescription>
            )}
          </SheetHeader>
          <SheetBody className="space-y-4 text-sm">
            {selected && (
              <>
                <div className="flex items-center gap-3">
                  <UserAvatar user={selected} size="lg" className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-muted-foreground">{selected.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {selected.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No role assigned</span>
                      ) : (
                        selected.roles.map((role) => (
                          <Badge key={role} variant="secondary" className="text-[10px]">
                            {role}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Department
                  </p>
                  <p className="text-sm">
                    {selected.departmentName ? (
                      <>
                        {selected.departmentName}{' '}
                        <span className="text-xs text-muted-foreground">
                          ({selected.departmentCode})
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Line to the top
                  </p>
                  {chain && chain.chain.length > 0 ? (
                    <ol className="space-y-1">
                      {chain.chain.map((entry, index) => (
                        <li key={entry.id} className="flex items-center gap-2 text-xs">
                          <span className="w-4 text-right text-muted-foreground">{index + 1}</span>
                          <button
                            type="button"
                            className="truncate text-left hover:text-primary hover:underline"
                            onClick={() => setSelectedId(entry.id)}
                          >
                            {entry.name}
                          </button>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-muted-foreground">Top of the chart.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Direct reports ({selected.reportIds.length})
                  </p>
                  {selected.reportIds.length === 0 ? (
                    <p className="text-xs text-muted-foreground">None.</p>
                  ) : (
                    <ul className="space-y-1">
                      {selected.reportIds.map((id) => {
                        const report = nodesById.get(id);
                        if (!report) return null;
                        return (
                          <li key={id}>
                            <button
                              type="button"
                              className="truncate text-left text-xs hover:text-primary hover:underline"
                              onClick={() => setSelectedId(id)}
                            >
                              {report.name}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {canManage && (
                  <>
                    <Separator />
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => moveMutation.mutate({ userId: selected.id, managerId: null })}
                      disabled={moveMutation.isPending || selected.directManagerId == null}
                    >
                      <GitBranch className="mr-2 h-4 w-4" />
                      Move to top of chart
                    </Button>
                  </>
                )}
              </>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

      <DepartmentSheet
        open={showDepartments}
        onOpenChange={setShowDepartments}
        canManage={canManage}
      />
    </div>
  );
}

/**
 * Department management.
 *
 * Deletion is left to the server: it refuses while people or sub-departments
 * still point at the row, and the message it returns is shown as-is.
 */
function DepartmentSheet({
  open,
  onOpenChange,
  canManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const { data: tree } = useQuery({
    queryKey: ['org', 'tree'],
    queryFn: () => orgApi.getTree(),
    enabled: open,
  });

  // Departments are a projection of the `division` master data, so the common
  // case is "promote a division that has no department yet" rather than typing
  // a new code. Anything left in the list is offered as a starting point.
  const { data: divisionData } = useReferenceData('division');
  const coveredCodes = useMemo(
    () => new Set((tree?.departments ?? []).map((dept) => dept.code)),
    [tree]
  );
  const availableDivisions = useMemo(
    () =>
      (tree ? toSelectOptions(divisionData) : []).filter(
        (division) => !coveredCodes.has(division.value)
      ),
    [divisionData, coveredCodes, tree]
  );

  const createMutation = useMutation({
    mutationFn: () => orgApi.createDepartment({ code: code.trim(), name: name.trim() }),
    onSuccess: () => {
      setCode('');
      setName('');
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Department created');
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.error || 'Could not create the department'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => orgApi.deleteDepartment(id),
    onSuccess: () => {
      setPendingDelete(null);
      queryClient.invalidateQueries({ queryKey: ['org'] });
      toast.success('Department deleted');
    },
    onError: (err: any) => {
      setPendingDelete(null);
      toast.error(err?.response?.data?.error || 'Could not delete the department');
    },
  });

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Departments</SheetTitle>
            <SheetDescription>
              Departments group people on the chart. A department can only be deleted once nobody
              belongs to it and no sub-department sits under it.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-5">
            {canManage && (
              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  New department
                </p>
                {availableDivisions.length > 0 && (
                  <div className="space-y-1">
                    <Label className="text-[11px]">Start from a division</Label>
                    <Select
                      value=""
                      onValueChange={(value) => {
                        setCode(value);
                        setName(
                          availableDivisions.find((d) => d.value === value)?.label ?? ''
                        );
                      }}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue placeholder="Pick a division from the master data…" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDivisions.map((division) => (
                          <SelectItem key={division.value} value={division.value}>
                            {division.label} ({division.value})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-[90px_1fr] gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Code</Label>
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder="IT"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Information Technology"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => createMutation.mutate()}
                  disabled={
                    createMutation.isPending ||
                    code.trim().length < 2 ||
                    name.trim().length < 2
                  }
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Create department
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {(tree?.departments ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No departments yet.</p>
              )}
              {(tree?.departments ?? []).map((dept) => (
                <div
                  key={dept.id}
                  className="flex items-center gap-2 rounded-lg border border-border/60 px-3 py-2"
                >
                  <span
                    className="h-6 w-1 rounded-full"
                    style={{ backgroundColor: departmentColor(dept.id) ?? undefined }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {dept.name}{' '}
                      <span className="text-xs font-normal text-muted-foreground">{dept.code}</span>
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {dept.managerName ? `Head: ${dept.managerName}` : 'No department head'}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete({ id: dept.id, name: dept.name })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </SheetBody>
          <SheetFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={pendingDelete != null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete department?"
        description={`“${pendingDelete?.name}” will be removed. This is refused while anyone still belongs to it.`}
        confirmLabel="Delete"
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
