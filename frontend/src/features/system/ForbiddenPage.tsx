import { Link, useLocation } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Shown when a route guard denies access.
 *
 * A redirect to the dashboard would look like a broken link; this page says
 * plainly that the page exists but this account lacks the capability, and
 * shows which URL was attempted so an admin can grant the right permission.
 */
export function ForbiddenPage() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlert className="h-7 w-7 text-destructive" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your account does not have the permission required for this page.
          {from ? (
            <>
              {' '}The URL was <code className="rounded bg-muted px-1 py-0.5">{from}</code>.
            </>
          ) : null}{' '}
          Ask an administrator to grant it in Access Control.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline">
          <Link to="/">Back to dashboard</Link>
        </Button>
        <Button asChild>
          <Link to="/my-work/timesheet">Go to my timesheet</Link>
        </Button>
      </div>
    </div>
  );
}
