import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useChartTheme } from '@/components/charts/chart-theme';
import type { DashboardAttentionItem } from '@/api/dashboard';
import { ATTENTION_ICON, severityColor, SEVERITY_RANK, type Severity } from './lib';

/**
 * The only block that is not a tier — it is the union of whatever the viewer
 * can see, sorted so the most urgent thing is at the top. Severity is carried
 * by a stripe *and* the wording, never by colour alone.
 */
export function AttentionSection({ items }: { items: DashboardAttentionItem[] }) {
  const theme = useChartTheme();
  const sorted = [...items].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Needs your attention</CardTitle>
        <p className="text-xs text-muted-foreground">
          Everything above, ranked by urgency. Only items you can act on appear here.
        </p>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <CheckCircle2 className="mb-2 h-8 w-8 text-emerald-500" />
            <p className="text-sm font-medium">All clear</p>
            <p className="text-xs text-muted-foreground">Nothing needs a decision from you.</p>
          </div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {sorted.map((item) => {
              const Icon = ATTENTION_ICON[item.kind] ?? CheckCircle2;
              return (
                <li key={`${item.kind}-${item.title}`}>
                  <Link
                    to={item.href}
                    className="group flex h-full items-start gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:bg-muted/50"
                  >
                    <span
                      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                      style={{ backgroundColor: `${severityColor(theme, item.severity as Severity)}22` }}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{ color: severityColor(theme, item.severity as Severity) }}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium leading-snug">{item.title}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
