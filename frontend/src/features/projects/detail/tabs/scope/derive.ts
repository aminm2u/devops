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

/** Move intent for the reorder endpoint: up/down within the current parent. */
export function moveWithinParent(
  tree: ScopeNode[],
  itemId: number,
  direction: 'up' | 'down'
): { id: number; parentId: number | null; sortOrder: number }[] {
  const flat = flattenScopeTree(tree);
  const node = flat.find((n) => n.item.id === itemId);
  if (!node) return [];
  const parentId = node.item.parentId;
  const siblings = (parentId ? flat.filter((n) => n.item.parentId === parentId) : flat.filter((n) => n.item.parentId === null)).sort(
    (a, b) => a.item.sortOrder - b.item.sortOrder
  );
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

export const SCOPE_STATUS_STYLES: Record<ScopeItem['status'], string> = {
  planned: 'border-muted-foreground/40 text-muted-foreground',
  in_progress: 'border-blue-500/60 text-blue-600 dark:text-blue-400',
  completed: 'border-green-600/60 text-green-600 dark:text-green-400',
};
