import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { helpdeskApi } from '@/api/helpdesk';
import { HelpdeskReportView } from './HelpdeskReportView';

/**
 * Helpdesk report page — data loading only.
 *
 * The period lives in the URL (`?month=10&year=2026`) so a report can be
 * bookmarked or pasted into a thread and open on the same month. With no
 * period in the URL the page opens on the newest month that contains tickets,
 * which is the current month in normal use and the last active one on a quiet
 * 1st of the month.
 */
export function HelpdeskReportPage() {
  const [params, setParams] = useSearchParams();

  const periodsQuery = useQuery({
    queryKey: ['helpdesk-report-periods'],
    queryFn: () => helpdeskApi.periods(),
    staleTime: 5 * 60_000,
  });

  const periods = periodsQuery.data;

  const requested = useMemo(() => {
    const month = Number(params.get('month'));
    const year = Number(params.get('year'));
    if (Number.isInteger(month) && month >= 1 && month <= 12 && year > 2000) {
      return { month, year };
    }
    return null;
  }, [params]);

  const period = useMemo(() => {
    if (requested) return requested;
    if (periods && periods.length > 0) {
      return { month: periods[0].month, year: periods[0].year };
    }
    const now = new Date();
    return { month: now.getMonth() + 1, year: now.getFullYear() };
  }, [requested, periods]);

  const reportQuery = useQuery({
    queryKey: ['helpdesk-report', period.year, period.month],
    queryFn: () => helpdeskApi.monthlyReport(period.month, period.year),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

  if (reportQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
        <h2 className="text-lg font-semibold">Could not load the report</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          The request failed. This is usually a session or server issue.
        </p>
        <Button variant="outline" onClick={() => reportQuery.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <HelpdeskReportView
      report={reportQuery.data}
      periods={periods ?? []}
      month={period.month}
      year={period.year}
      isLoading={reportQuery.isLoading || (periodsQuery.isLoading && !requested)}
      onPeriodChange={(month, year) => {
        setParams(
          {
            month: String(month),
            year: String(year),
          },
          { replace: true }
        );
      }}
    />
  );
}
