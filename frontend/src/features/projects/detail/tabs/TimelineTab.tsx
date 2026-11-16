import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Ghost, Link as LinkIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { scopeApi } from '@/api/scope';
import { buildScopeTimeline, buildBaselineBars, type TimelineScopeItem } from './timeline/derive';
import { ScopeGantt } from './timeline/ScopeGantt';

/**
 * Timeline — rendered from the scope tree (the spine): every item with dates
 * gets a bar, parent phases roll up their children. Dates are edited on the
 * Scope tab; this view never mutates.
 *
 * When baselines exist, one can be overlaid: ghost bars behind the current
 * bars show slippage and extensions since that revision was frozen.
 */
export function TimelineTab({ projectId, project }: { projectId: number; project: any }) {
  const [baselineId, setBaselineId] = useState('');

  const scopeItems = (project.scopeItems ?? []) as TimelineScopeItem[];
  const timeline = buildScopeTimeline(scopeItems);

  const { data: baselinesData } = useQuery({
    queryKey: ['scope-baselines', projectId],
    queryFn: () => scopeApi.listBaselines(projectId),
  });
  const baselines = baselinesData?.data ?? [];

  const { data: baselineDetail } = useQuery({
    queryKey: ['scope-baseline', projectId, baselineId],
    queryFn: () => scopeApi.getBaseline(projectId, Number(baselineId)),
    enabled: baselineId !== '',
  });

  const selectedBaseline = baselines.find((b) => String(b.id) === baselineId);
  const baselineBars =
    baselineDetail?.data?.items && timeline
      ? buildBaselineBars(baselineDetail.data.items, timeline)
      : undefined;
  const baselineLabel = selectedBaseline ? `Rev ${selectedBaseline.revision}` : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Project Timeline</CardTitle>
        <div className="flex items-center gap-3">
          {scopeItems.length === 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <LinkIcon className="h-3.5 w-3.5" />
              Add scope items with dates on the Scope tab
            </span>
          )}
          {baselines.length > 0 && timeline && (
            <div className="flex items-center gap-2">
              <Ghost className="h-3.5 w-3.5 text-muted-foreground" />
              <Select value={baselineId || 'none'} onValueChange={(v) => setBaselineId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Overlay baseline…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No overlay</SelectItem>
                  {baselines.map((baseline) => (
                    <SelectItem key={baseline.id} value={String(baseline.id)}>
                      Rev {baseline.revision} — {baseline.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ScopeGantt timeline={timeline} baselineBars={baselineBars} baselineLabel={baselineLabel} />
      </CardContent>
    </Card>
  );
}
