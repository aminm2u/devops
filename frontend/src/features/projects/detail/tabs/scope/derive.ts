import type { ScopeItem } from '@/api/scope';

/**
 * Pure helpers for the scope tree — no React here, so the shape logic stays
 * testable and importable from anywhere.
 */

export interface ScopeNode {
  item: ScopeItem;
  children: ScopeNode[];
  depth: number;
}

/** Builds an ordered tree from the flat list. Children keep server order. */
export function buildScopeTree(items: ScopeItem[]): ScopeNode[] {
  const nodes = new Map<number, ScopeNode>(items.map((item) => [item.id, { item, children: [], depth: 0 }]));
  const roots: ScopeNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.item.parentId;
    const parent = parentId ? nodes.get(parentId) : undefined;
    if (parent) {
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  // Depth is assigned in map-iteration order above, so a child listed before
  // its parent can end up one level too shallow. Re-derive depth top-down now
  // that the links exist — cheap, and it removes a real ordering trap.
  const setDepth = (list: ScopeNode[], depth: number) => {
    for (const node of list) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  };
  setDepth(roots, 0);

  const sortRec = (list: ScopeNode[]) => {
    list.sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.item.id - b.item.id);
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

/** Depth-first flatten preserving tree order — the render order. */
export function flattenScopeTree(tree: ScopeNode[]): ScopeNode[] {
  const out: ScopeNode[] = [];
  const walk = (list: ScopeNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/**
 * Visible rows in render order: the depth-first flatten with collapsed
 * subtrees pruned. This is the list keyboard navigation walks and the list the
 * renderer maps over, so both always agree.
 */
export function visibleScopeNodes(
  tree: ScopeNode[],
  collapsed: Record<number, boolean>,
  forcedOpen?: Set<number>
): ScopeNode[] {
  const out: ScopeNode[] = [];
  const walk = (list: ScopeNode[]) => {
    for (const node of list) {
      out.push(node);
      const open = forcedOpen?.has(node.item.id) ? true : !collapsed[node.item.id];
      if (node.children.length > 0 && open) walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/** WBS depth: "1" → 0, "1.2" → 1, "1.2.3" → 2. */
export function wbsDepth(wbsNumber: string): number {
  return wbsNumber.split('.').length - 1;
}

/** Sibling position, used to disable Move up/down at the list boundaries. */
export function canMove(tree: ScopeNode[], itemId: number, direction: 'up' | 'down'): boolean {
  const flat = flattenScopeTree(tree);
  const node = flat.find((n) => n.item.id === itemId);
  if (!node) return false;
  const siblings = siblingsOf(flat, node.item.parentId);
  const index = siblings.findIndex((n) => n.item.id === itemId);
  return direction === 'up' ? index > 0 : index >= 0 && index < siblings.length - 1;
}

function siblingsOf(flat: ScopeNode[], parentId: number | null): ScopeNode[] {
  return flat
    .filter((n) => n.item.parentId === parentId)
    .sort((a, b) => a.item.sortOrder - b.item.sortOrder || a.item.id - b.item.id);
}

/** Move intent for the reorder endpoint: up/down within the current parent. */
export function moveWithinParent(
  tree: ScopeNode[],
  itemId: number,
  direction: 'up' | 'down'
): { id: number; parentId: number | null; sortOrder: number }[] {
  const flat = flattenScopeTree(tree);
  const node = flat.find((n) => n.item.id === itemId);
  if (!node) return [];
  const siblings = siblingsOf(flat, node.item.parentId);
  const idx = siblings.findIndex((n) => n.item.id === itemId);
  const swapWith = direction === 'up' ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return [];

  const a = node.item;
  const b = swapWith.item;
  return [
    { id: a.id, parentId: a.parentId, sortOrder: b.sortOrder },
    { id: b.id, parentId: b.parentId, sortOrder: a.sortOrder },
  ];
}

export interface ScopeSummary {
  /** Roots only — the server folds children into each parent, so summing
   *  every row would double-count the whole tree. */
  planCost: number;
  actualCost: number;
  /** plan − actual; negative means over budget. */
  variance: number;
  overBudget: boolean;
  loggedHours: number;
  /** Portion of the work packages that are complete, 0–100. Null when there
   *  are no leaves (an empty tree has no progress to report). */
  progressPercent: number | null;
  items: number;
  /** Items that are nobody's parent — the actual work packages. */
  leaves: number;
  completedLeaves: number;
}

/**
 * Totals for the summary strip. Roots only, because `planCost`/`actualCost`/
 * `loggedHours` on a parent already include its subtree
 * (see scope.routes.ts recomputeScopeCosts + the GET rollup).
 */
export function summarizeScope(items: ScopeItem[]): ScopeSummary {
  const parentIds = new Set(items.map((item) => item.parentId).filter((id): id is number => id != null));
  const roots = items.filter((item) => item.parentId == null);
  const leaves = items.filter((item) => !parentIds.has(item.id));

  let planCost = 0;
  let actualCost = 0;
  let loggedHours = 0;
  for (const root of roots) {
    planCost += Number(root.planCost ?? 0);
    actualCost += Number(root.actualCost ?? 0);
    loggedHours += Number(root.loggedHours ?? 0);
  }

  const variance = planCost - actualCost;

  // Progress is measured over the work packages, not the phases. Averaging
  // only the roots that happen to have a progress value reports 100% when one
  // subtree is done and the rest have not started — and it would contradict
  // the "2 of 5 work packages done" caption sitting right beside it.
  const progressPercent =
    leaves.length > 0
      ? Math.round((leaves.filter((item) => item.status === 'completed').length / leaves.length) * 100)
      : null;

  return {
    planCost,
    actualCost,
    variance,
    overBudget: variance < 0,
    loggedHours,
    progressPercent,
    items: items.length,
    leaves: leaves.length,
    completedLeaves: leaves.filter((item) => item.status === 'completed').length,
  };
}

export interface ScopeRowMeta {
  /** Last among its siblings — the elbow has nothing below it. */
  isLast: boolean;
  /** One flag per ancestor level, outermost first: does that ancestor have a
   *  sibling under it? A rail is only drawn where the answer is yes. */
  ancestorHasMore: boolean[];
}

/**
 * Per-row tree-drawing metadata for a preorder list.
 *
 * Siblings are not always adjacent in the list (a node's subtree sits between
 * it and its next sibling), so "is this the last child" is decided by grouping
 * the visible rows under their parent rather than by peeking at the next row.
 */
export function scopeRowMeta(visible: ScopeNode[]): Map<number, ScopeRowMeta> {
  const byId = new Map<number, ScopeNode>();
  const byParent = new Map<number | null, ScopeNode[]>();
  for (const node of visible) {
    byId.set(node.item.id, node);
    const key = node.item.parentId ?? null;
    const bucket = byParent.get(key);
    if (bucket) bucket.push(node);
    else byParent.set(key, [node]);
  }

  const isLastMap = new Map<number, boolean>();
  for (const siblings of byParent.values()) {
    siblings.forEach((node, index) => isLastMap.set(node.item.id, index === siblings.length - 1));
  }

  const meta = new Map<number, ScopeRowMeta>();
  for (const node of visible) {
    // Walk up to the root, then reverse so level 0 is the outermost ancestor —
    // the order the guide columns are drawn in.
    const chain: number[] = [];
    let parentId = node.item.parentId ?? null;
    while (parentId != null) {
      chain.push(parentId);
      parentId = byId.get(parentId)?.item.parentId ?? null;
    }
    chain.reverse();
    meta.set(node.item.id, {
      isLast: isLastMap.get(node.item.id) ?? true,
      ancestorHasMore: chain.map((id) => !(isLastMap.get(id) ?? true)),
    });
  }
  return meta;
}

export interface ScopeFilter {
  tree: ScopeNode[];
  /** Items matching the query/filter directly (for row highlighting). */
  matchedIds: Set<number>;
  /** Ancestors of matches — must be expanded so the hit is visible. */
  forcedOpenIds: Set<number>;
  matchCount: number;
}

/**
 * Prune the tree to matches plus their ancestors, and report which ancestors
 * must be force-opened. `all` status and an empty query return the tree intact
 * with no forced state, so the caller can skip the whole code path.
 */
export function filterScopeTree(
  tree: ScopeNode[],
  opts: { query?: string; status?: ScopeItem['status'] | 'all' }
): ScopeFilter {
  const query = (opts.query ?? '').trim().toLowerCase();
  const status = opts.status ?? 'all';
  const matchedIds = new Set<number>();
  const forcedOpenIds = new Set<number>();

  if (!query && status === 'all') {
    const count = flattenScopeTree(tree).length;
    return { tree, matchedIds, forcedOpenIds, matchCount: count };
  }

  const matches = (item: ScopeItem): boolean => {
    if (status !== 'all' && item.status !== status) return false;
    if (!query) return true;
    const haystack = [
      item.title,
      item.wbsNumber,
      item.assignee?.name ?? '',
      ...(item.roleCodes ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  };

  /** Returns the pruned subtree, or null when nothing below matches. */
  const prune = (node: ScopeNode, ancestors: number[]): ScopeNode | null => {
    const selfMatch = matches(node.item);
    const keptChildren: ScopeNode[] = [];
    let childMatched = false;
    for (const child of node.children) {
      const kept = prune(child, [...ancestors, node.item.id]);
      if (kept) {
        keptChildren.push(kept);
        childMatched = true;
      }
    }
    if (selfMatch) {
      matchedIds.add(node.item.id);
      // A direct hit keeps its whole subtree: the user searched for this
      // work package and expects to see what is under it.
      for (const id of ancestors) forcedOpenIds.add(id);
      return { ...node, children: childMatched ? keptChildren : node.children };
    }
    if (childMatched) {
      return { ...node, children: keptChildren };
    }
    return null;
  };

  const kept: ScopeNode[] = [];
  for (const root of tree) {
    const pruned = prune(root, []);
    if (pruned) kept.push(pruned);
  }

  return { tree: kept, matchedIds, forcedOpenIds, matchCount: matchedIds.size };
}

/**
 * Tree order: compare WBS segment by numeric segment — "1.1" < "1.2" < "2" <
 * "2.1.1". A plain string sort would put "2.1.1" before "11" and after "1.10";
 * numeric segments keep the workbook order people expect.
 */
export function compareWbs(a: { wbsNumber: string }, b: { wbsNumber: string }): number {
  const segsA = a.wbsNumber.split('.').map(Number);
  const segsB = b.wbsNumber.split('.').map(Number);
  const len = Math.max(segsA.length, segsB.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (segsA[i] ?? 0) - (segsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
