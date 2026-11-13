import { Link } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { buildScopeTimeline, type TimelineScopeItem } from './timeline/derive';
import { ScopeGantt } from './timeline/ScopeGantt';

/**
 * Timeline — rendered from the scope tree (the spine): every item with dates
 * gets a bar, parent phases roll up their children. Dates are edited on the
 * Scope tab; this view never mutates.
 */
export function TimelineTab({ project }: { project: any }) {
  const scopeItems = (project.scopeItems ?? []) as TimelineScopeItem[];
  const timeline = buildScopeTimeline(scopeItems);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Project Timeline</CardTitle>
        {scopeItems.length === 0 && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Link className="h-3.5 w-3.5" />
            Add scope items with dates on the Scope tab
          </span>
        )}
      </CardHeader>
      <CardContent>
        <ScopeGantt timeline={timeline} />
      </CardContent>
    </Card>
  );
}
