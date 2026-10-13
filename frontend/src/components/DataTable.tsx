import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/empty-state';
import { ListToolbar } from '@/components/list-toolbar';
import { Pagination } from '@/components/Pagination';
import { cn } from '@/lib/utils';

export type SortDirection = 'asc' | 'desc';

export interface DataTableSortState {
  key: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  /** Stable identifier for the column; also acts as the sort key. */
  key: string;
  /** Header cell label or node. */
  header: React.ReactNode;
  /** Primary data extractor for display and default sort comparison. */
  accessor?: (row: T) => React.ReactNode;
  /** Custom renderer for cell contents; overrides accessor for display. */
  render?: (row: T) => React.ReactNode;
  /** Custom sort value extractor; required if accessor returns JSX/objects. */
  sortValue?: (row: T) => string | number | null | undefined;
  /** Whether clicking the column header cycles through asc -> desc -> none sorting. */
  sortable?: boolean;
  /** Horizontal alignment for both header and cell. Defaults to 'left'. */
  align?: 'left' | 'center' | 'right';
  /** Classes applied to each data cell (td) in this column. */
  className?: string;
  /** Classes applied to the header cell (th) in this column. */
  headerClassName?: string;
  /** Width utility class applied to th and td, e.g. 'w-24' or 'w-12'. */
  width?: string;
  /**
   * Skeleton element classes while loading. Defaults to 'h-4 w-full max-w-[120px]'.
   * Pass 'h-10 w-10 rounded-full' for user avatar columns.
   */
  skeletonClassName?: string;
}

export interface DataTablePagination {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
}

export interface DataTableSearchConfig {
  /** Current search query string. */
  value: string;
  /** Called after debounce when the user types in the search input. */
  onChange: (value: string) => void;
  placeholder?: string;
  /** Debounce delay in milliseconds. Defaults to 300ms. */
  debounceMs?: number;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  /** Row key extractor; defaults to item index. */
  rowKey?: (row: T, index: number) => React.Key;
  /** When true, renders skeleton rows instead of row data. */
  loading?: boolean;
  /** Number of skeleton rows to render while loading. Defaults to 5. */
  loadingRows?: number;
  /** Error message or custom ReactNode rendered when query fails. */
  error?: React.ReactNode;
  /** Icon shown when table is empty. */
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Search bar configuration; renders ListToolbar above the table when present. */
  search?: DataTableSearchConfig;
  /** Additional filter controls (e.g. Select dropdowns) placed in the toolbar next to search. */
  filters?: React.ReactNode;
  /** Pagination state and handler; renders Pagination component below the table. */
  pagination?: DataTablePagination;
  /** Initial sort state. */
  defaultSort?: DataTableSortState;
  /**
   * Called whenever sorting state changes (tri-state: asc -> desc -> null).
   * Note: Client-side sorting applies to the currently loaded page of records.
   */
  onSortChange?: (sort: DataTableSortState | null) => void;
  /** Called when a row is clicked or activated with Enter/Space. */
  onRowClick?: (row: T) => void;
  /** Additional classes applied to each row, or a function taking the row data. */
  rowClassName?: string | ((row: T) => string);
  /**
   * Render an extra full-width row underneath a given row (e.g. expandable details).
   * Return null or undefined to skip.
   */
  renderRowAfter?: (row: T) => React.ReactNode;
  /** Keeps table headers visible while scrolling a long vertical table. */
  stickyHeader?: boolean;
  className?: string;
}

const alignClasses = {
  left: 'text-left justify-start',
  center: 'text-center justify-center',
  right: 'text-right justify-end',
};

/**
 * Standard data table component providing sortable column headers, debounced search,
 * skeleton loading states, empty/error boundaries, pagination, and keyboard-accessible rows.
 *
 * NOTE: Interactive elements (buttons, links) within a clickable row must call
 * `e.stopPropagation()` on click to prevent triggering `onRowClick`.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  loadingRows = 5,
  error,
  emptyIcon,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
  search,
  filters,
  pagination,
  defaultSort,
  onSortChange,
  onRowClick,
  rowClassName,
  renderRowAfter,
  stickyHeader = false,
  className,
}: DataTableProps<T>) {
  // Client sort state (tri-state: asc -> desc -> null)
  const [sort, setSort] = React.useState<DataTableSortState | null>(
    defaultSort ?? null
  );

  const handleSortToggle = (colKey: string) => {
    let nextSort: DataTableSortState | null = null;
    if (!sort || sort.key !== colKey) {
      nextSort = { key: colKey, direction: 'asc' };
    } else if (sort.direction === 'asc') {
      nextSort = { key: colKey, direction: 'desc' };
    } else {
      nextSort = null;
    }
    setSort(nextSort);
    onSortChange?.(nextSort);
  };

  // Local debounced search value
  const [localSearch, setLocalSearch] = React.useState(search?.value ?? '');
  const searchTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (search) {
      setLocalSearch(search.value);
    }
  }, [search?.value]);

  const handleSearchChange = (val: string) => {
    setLocalSearch(val);
    if (!search) return;

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    const delay = search.debounceMs ?? 300;
    searchTimerRef.current = setTimeout(() => {
      search.onChange(val);
    }, delay);
  };

  React.useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, []);

  // Sorted data memo
  const sortedData = React.useMemo(() => {
    if (!sort || !data || data.length === 0) return data;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return data;

    const copy = [...data];
    copy.sort((a, b) => {
      let valA: unknown;
      let valB: unknown;

      if (col.sortValue) {
        valA = col.sortValue(a);
        valB = col.sortValue(b);
      } else if (col.accessor) {
        valA = col.accessor(a);
        valB = col.accessor(b);
      } else {
        valA = (a as Record<string, unknown>)[col.key];
        valB = (b as Record<string, unknown>)[col.key];
      }

      // Nulls and undefined values sort to the bottom
      if (valA === null || valA === undefined || valA === '') return 1;
      if (valB === null || valB === undefined || valB === '') return -1;

      let comparison = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else {
        comparison = String(valA).localeCompare(String(valB), undefined, {
          numeric: true,
          sensitivity: 'base',
        });
      }

      return sort.direction === 'asc' ? comparison : -comparison;
    });

    return copy;
  }, [data, sort, columns]);

  return (
    <div className={cn('space-y-4 w-full', className)}>
      {/* Optional Search and Filter Toolbar */}
      {(search || filters) && (
        <ListToolbar
          searchValue={localSearch}
          onSearchChange={handleSearchChange}
          searchPlaceholder={search?.placeholder ?? 'Search...'}
        >
          {filters}
        </ListToolbar>
      )}

      {/* Table Container */}
      <div className="rounded-md border border-border bg-card shadow-sm overflow-hidden p-2">
        <Table>
          <TableHeader
            className={cn(
              stickyHeader && 'sticky top-0 z-10 bg-background/95 backdrop-blur'
            )}
          >
            <TableRow className="hover:bg-transparent border-b">
              {columns.map((col) => {
                const align = col.align ?? 'left';
                const isSorted = sort?.key === col.key;
                const isSortable = Boolean(col.sortable);

                return (
                  <TableHead
                    key={col.key}
                    aria-sort={
                      isSorted
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : undefined
                    }
                    className={cn(
                      col.width,
                      col.headerClassName
                    )}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => handleSortToggle(col.key)}
                        className={cn(
                          'inline-flex items-center gap-1.5 py-1 px-1 -ml-1 rounded transition-colors',
                          'hover:bg-muted/70 hover:text-foreground font-medium text-xs',
                          isSorted ? 'text-foreground' : 'text-muted-foreground',
                          alignClasses[align]
                        )}
                        title={`Sort by ${typeof col.header === 'string' ? col.header : col.key}`}
                      >
                        <span>{col.header}</span>
                        {isSorted ? (
                          sort.direction === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5 text-primary" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3.5 w-3.5 opacity-40 group-hover:opacity-100" />
                        )}
                      </button>
                    ) : (
                      <div className={cn('flex items-center', alignClasses[align])}>
                        {col.header}
                      </div>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {/* Loading Skeleton Rows */}
            {loading ? (
              Array.from({ length: loadingRows }).map((_, rIdx) => (
                <TableRow key={`skeleton-row-${rIdx}`} className="hover:bg-transparent">
                  {columns.map((col, cIdx) => (
                    <TableCell
                      key={`skeleton-cell-${rIdx}-${cIdx}`}
                      className={cn(col.width, col.className)}
                    >
                      <Skeleton
                        className={cn(
                          col.skeletonClassName || 'h-4 w-full max-w-[120px]'
                        )}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : error ? (
              /* Error State */
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center"
                >
                  {typeof error === 'string' ? (
                    <p className="text-sm font-medium text-destructive">{error}</p>
                  ) : (
                    error
                  )}
                </TableCell>
              </TableRow>
            ) : sortedData.length === 0 ? (
              /* Empty State */
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={columns.length}
                  className="py-10 text-center"
                >
                  <EmptyState
                    icon={emptyIcon}
                    title={emptyTitle}
                    description={emptyDescription}
                    action={emptyAction}
                    size="sm"
                  />
                </TableCell>
              </TableRow>
            ) : (
              /* Data Rows */
              sortedData.map((row, rIdx) => {
                const key = rowKey ? rowKey(row, rIdx) : rIdx;
                const afterContent = renderRowAfter?.(row);
                const extraRowClass =
                  typeof rowClassName === 'function'
                    ? rowClassName(row)
                    : rowClassName;

                const isClickable = Boolean(onRowClick);

                return (
                  <React.Fragment key={key}>
                    <TableRow
                      tabIndex={isClickable ? 0 : undefined}
                      onClick={isClickable ? () => onRowClick?.(row) : undefined}
                      onKeyDown={
                        isClickable
                          ? (e) => {
                              if (e.key === 'Enter') {
                                onRowClick?.(row);
                              } else if (e.key === ' ') {
                                e.preventDefault();
                                onRowClick?.(row);
                              }
                            }
                          : undefined
                      }
                      className={cn(
                        isClickable &&
                          'cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-muted/40',
                        extraRowClass
                      )}
                    >
                      {columns.map((col) => {
                        const align = col.align ?? 'left';
                        const content = col.render
                          ? col.render(row)
                          : col.accessor
                          ? col.accessor(row)
                          : (row as Record<string, unknown>)[col.key] as React.ReactNode;

                        return (
                          <TableCell
                            key={`${key}-${col.key}`}
                            className={cn(
                              align === 'center' && 'text-center',
                              align === 'right' && 'text-right',
                              align === 'left' && 'text-left',
                              col.width,
                              col.className
                            )}
                          >
                            {content}
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {afterContent && (
                      <TableRow className="hover:bg-transparent bg-muted/20">
                        <TableCell
                          colSpan={columns.length}
                          className="p-3"
                        >
                          {afterContent}
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Footer */}
      {pagination && (
        <div className="pt-1">
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={pagination.onPageChange}
            totalItems={pagination.totalItems}
            itemsPerPage={pagination.itemsPerPage}
          />
        </div>
      )}
    </div>
  );
}
