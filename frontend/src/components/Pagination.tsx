import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  itemsPerPage?: number;
}

export function Pagination({ page, totalPages, onPageChange, totalItems, itemsPerPage }: PaginationProps) {
  // `totalItems !== undefined` rather than a truthiness check: an empty result
  // (0 of 0) is still worth reporting, and a falsy 0 used to hide the whole
  // footer so the list looked like it had lost its pagination entirely.
  const hasSummary = totalItems !== undefined && Boolean(itemsPerPage);
  const showControls = totalPages > 1;

  if (!hasSummary && !showControls) return null;

  const startItem = hasSummary ? (totalItems === 0 ? 0 : (page - 1) * itemsPerPage! + 1) : 0;
  const endItem = hasSummary ? Math.min(page * itemsPerPage!, totalItems!) : 0;

  return (
    <div className="flex items-center justify-between">
      {/* The summary stays visible on a single page — a twelve-person directory
          otherwise looks like it has no pagination at all. */}
      {hasSummary && (
        <p className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {totalItems} items
        </p>
      )}
      {showControls && (
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-2">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
