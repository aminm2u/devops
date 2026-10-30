import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Video,
  RefreshCw,
  Loader2,
  Link as LinkIcon,
  Unlink,
  Clock,
  CheckCircle2,
  PlusCircle,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { microsoftApi } from '@/api/microsoft';
import type { MicrosoftAppConfig, MicrosoftCalendarEvent, MicrosoftAccountStatus } from '@/api/microsoft';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

/**
 * Microsoft Teams integration card shown on the consolidated Profile page.
 *
 * Two levels of configuration:
 *  1. Admin: Entra ID app registration (tenant/client/secret).
 *  2. Per user: connect account, calendar auto-sync, timesheet auto/on-click sync.
 */
export function MicrosoftIntegration({ canManageApp }: { canManageApp?: boolean }) {
  const queryClient = useQueryClient();

  const { data: appConfig } = useQuery({
    queryKey: ['microsoft-app-config'],
    queryFn: microsoftApi.getAppConfig,
  });

  const { data: account, isLoading: accountLoading } = useQuery({
    queryKey: ['microsoft-me'],
    queryFn: microsoftApi.getMe,
  });

  const settingsMutation = useMutation({
    mutationFn: microsoftApi.updateMe,
    onSuccess: (data) => {
      queryClient.setQueryData(['microsoft-me'], data);
      toast.success('Sync settings saved');
    },
    onError: () => toast.error('Failed to save sync settings'),
  });

  const disconnectMutation = useMutation({
    mutationFn: microsoftApi.disconnect,
    onSuccess: () => {
      queryClient.setQueryData(['microsoft-me'], { connected: false });
      queryClient.invalidateQueries({ queryKey: ['microsoft-app-config'] });
      toast.success('Microsoft account disconnected');
    },
    onError: () => toast.error('Failed to disconnect'),
  });

  const connected = account?.connected;
  const appReady = appConfig?.configured;

  if (accountLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Video className="h-5 w-5 text-[#6264A7]" />
          Microsoft Teams
        </CardTitle>
        <CardDescription>
          Sync your Microsoft 365 calendar and turn attended meetings into timesheet entries
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Admin-level app registration */}
        {canManageApp && <AdminAppConfig appConfig={appConfig} />}

        {!appReady && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-600 dark:text-amber-400">
            Microsoft integration is not configured yet.
            {canManageApp
              ? ' Fill in the Entra ID app registration above to enable it.'
              : ' Ask an administrator to register the Entra ID app (Profile → Microsoft Teams).'}
          </div>
        )}

        {/* Connection status */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="flex items-center gap-3">
            {connected ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Unlink className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">{connected ? 'Connected' : 'Not connected'}</p>
              <p className="text-xs text-muted-foreground">
                {connected
                  ? `${account!.email}${account!.lastSyncedAt ? ` · last synced ${format(new Date(account!.lastSyncedAt), 'dd MMM yyyy HH:mm')}` : ''}`
                  : 'Sign in with your Microsoft work account (Entra ID)'}
              </p>
            </div>
          </div>
          {connected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="mr-2 h-4 w-4" />
              )}
              Disconnect
            </Button>
          ) : (
            <a
              href={microsoftApi.connectUrl}
              aria-disabled={!appReady}
              onClick={(e) => {
                if (!appReady) {
                  e.preventDefault();
                  toast.error('Microsoft integration is not configured yet');
                }
              }}
            >
              <Button size="sm" disabled={!appReady}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Connect Microsoft account
              </Button>
            </a>
          )}
        </div>

        {connected && (
          <>
            <Separator />
            <SyncSettings
              account={account!}
              onChange={(patch) => settingsMutation.mutate(patch)}
              saving={settingsMutation.isPending}
            />
            <Separator />
            <MeetingSyncPanel connected={!!connected} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Admin: Entra ID app registration ─────────────────────────────────────────
function AdminAppConfig({ appConfig }: { appConfig?: MicrosoftAppConfig }) {
  const [tenantId, setTenantId] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (appConfig?.configured) {
      setTenantId(appConfig.tenantId || '');
      setClientId(appConfig.clientId || '');
    }
  }, [appConfig]);

  const handleSave = async () => {
    if (!tenantId || !clientId) {
      toast.error('Tenant ID and Client ID are required');
      return;
    }
    setSaving(true);
    try {
      await microsoftApi.saveAppConfig({
        tenantId,
        clientId,
        clientSecret: clientSecret || undefined,
      });
      toast.success('Microsoft app configuration saved');
      setClientSecret('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="rounded-lg border p-4" open={!appConfig?.configured}>
      <summary className="cursor-pointer text-sm font-medium">
        Entra ID app registration {appConfig?.configured && <Badge variant="secondary" className="ml-2">configured</Badge>}
      </summary>
      <div className="mt-4 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ms-tenant">Tenant ID</Label>
          <Input
            id="ms-tenant"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            placeholder="common or your-tenant-id / contoso.onmicrosoft.com"
          />
          <p className="text-xs text-muted-foreground">
            Use <code>common</code> to allow any Entra ID tenant (personal sign-ins allowed), or your tenant ID to restrict to your organisation.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ms-client">Application (client) ID</Label>
          <Input
            id="ms-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          <p className="text-xs text-muted-foreground">
            From Azure portal → Entra ID → App registrations → your app → Overview.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ms-secret">Client secret</Label>
          <Input
            id="ms-secret"
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder={appConfig?.clientSecretSet ? '•••••••• (saved — leave blank to keep)' : 'Enter client secret value'}
          />
          <p className="text-xs text-muted-foreground">
            From App registrations → Certificates &amp; secrets. Stored encrypted.
          </p>
        </div>
        {appConfig?.redirectUri && (
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground mb-1">Redirect URI — add this in App registrations → Authentication:</p>
            <code className="break-all">{appConfig.redirectUri}</code>
          </div>
        )}
        <Button onClick={handleSave} disabled={saving} size="sm">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save App Registration
        </Button>
      </div>
    </details>
  );
}

// ── Per-user sync preferences ────────────────────────────────────────────────
function SyncSettings({
  account,
  onChange,
  saving,
}: {
  account: NonNullable<MicrosoftAccountStatus>;
  onChange: (patch: Parameters<typeof microsoftApi.updateMe>[0]) => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Show meetings in calendar
          </p>
          <p className="text-xs text-muted-foreground">
            Meetings from your Microsoft 365 calendar appear automatically in My Work Portal → Calendar
          </p>
        </div>
        <Switch
          checked={account.calendarSyncEnabled ?? true}
          onCheckedChange={(v) => onChange({ calendarSyncEnabled: v })}
          disabled={saving}
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <p className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Auto-create timesheet drafts
          </p>
          <p className="text-xs text-muted-foreground">
            On: draft entries (with the meeting period) are created automatically after each sync.
            Off: log attendance per meeting with one click from the list below or the calendar.
          </p>
        </div>
        <Switch
          checked={account.timesheetAutoSync ?? false}
          onCheckedChange={(v) => onChange({ timesheetAutoSync: v })}
          disabled={saving}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ms-min-minutes">Minimum meeting length (minutes)</Label>
            <Input
              id="ms-min-minutes"
              type="number"
              min={0}
              max={1440}
              value={account.minMeetingMinutes ?? 15}
              onChange={(e) => onChange({ minMeetingMinutes: parseInt(e.target.value, 10) || 0 })}
              disabled={saving}
            />
            <p className="text-xs text-muted-foreground">Meetings shorter than this are never logged</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ms-category">Timesheet category</Label>
            <select
              id="ms-category"
              value={account.timesheetCategory ?? 'meeting'}
              onChange={(e) => onChange({ timesheetCategory: e.target.value })}
              disabled={saving}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="meeting">Meeting</option>
              <option value="project">Project</option>
              <option value="management">Management</option>
              <option value="programme">Programme</option>
              <option value="others">Others</option>
            </select>
            <p className="text-xs text-muted-foreground">Category used for meeting-derived entries</p>
          </div>
        </div>
    </div>
  );
}
function MeetingSyncPanel({ connected }: { connected: boolean }) {
  const queryClient = useQueryClient();
  const [syncResult, setSyncResult] = useState<{ imported: number; updated: number } | null>(null);

  const syncMutation = useMutation({
    mutationFn: () => {
      const now = new Date();
      const from = format(new Date(now.getFullYear(), now.getMonth() - 1, 1), 'yyyy-MM-dd');
      const to = format(new Date(now.getFullYear(), now.getMonth() + 2, 0), 'yyyy-MM-dd');
      return microsoftApi.sync({ from, to });
    },
    onSuccess: (data) => {
      setSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ['microsoft-events'] });
      queryClient.invalidateQueries({ queryKey: ['microsoft-me'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet-calendar'] });
      toast.success(`Synced: ${data.imported} new, ${data.updated} updated`);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Sync failed'),
  });

  // Upcoming + recent meetings (± 7 days around today)
  const now = new Date();
  const { data: events } = useQuery({
    queryKey: ['microsoft-events', 'panel'],
    queryFn: () =>
      microsoftApi.listEvents({
        from: format(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7), 'yyyy-MM-dd'),
        to: format(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7), 'yyyy-MM-dd'),
      }),
    enabled: connected,
  });

  const logMutation = useMutation({
    mutationFn: (eventId: number) => microsoftApi.logAttendance(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['microsoft-events'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet-calendar'] });
      toast.success('Attendance logged as timesheet draft');
    },
    onError: () => toast.error('Failed to log attendance'),
  });

  const meetings = (events ?? []).slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Meetings (± 7 days)</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Sync now
        </Button>
      </div>

      {syncResult && (
        <div className="flex gap-4 rounded-lg border bg-muted/50 p-3 text-sm">
          <span className="text-green-600">✓ {syncResult.imported} imported</span>
          <span className="text-blue-600">↻ {syncResult.updated} updated</span>
        </div>
      )}

      {!meetings.length ? (
        <p className="py-2 text-center text-sm text-muted-foreground">
          No meetings cached yet — click “Sync now” to pull your Microsoft 365 calendar.
        </p>
      ) : (
        <div className="divide-y rounded-lg border">
          {meetings.map((m) => (
            <MeetingRow key={m.id} meeting={m} onLog={() => logMutation.mutate(m.id)} logging={logMutation.isPending} />
          ))}
        </div>
      )}
    </div>
  );
}

function MeetingRow({
  meeting,
  onLog,
  logging,
}: {
  meeting: MicrosoftCalendarEvent;
  onLog: () => void;
  logging: boolean;
}) {
  const start = new Date(meeting.startAt);
  const end = new Date(meeting.endAt);
  const hours = (end.getTime() - start.getTime()) / 3600000;
  const sameDay = start.toDateString() === end.toDateString();

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {meeting.isOnlineMeeting && <Video className="mr-1.5 inline h-3.5 w-3.5 text-[#6264A7]" />}
          {meeting.subject}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(start, 'EEE dd MMM, HH:mm')} – {sameDay ? format(end, 'HH:mm') : format(end, 'EEE dd MMM, HH:mm')}
          {' '}· {Number(hours.toFixed(2))}h
          {meeting.timeEntryId && (
            <Badge variant="secondary" className="ml-2 text-[10px]">logged</Badge>
          )}
        </p>
      </div>
      {meeting.timeEntryId ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
      ) : (
        <Button variant="outline" size="sm" onClick={onLog} disabled={logging}>
          {logging ? (
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
          ) : (
            <PlusCircle className="mr-2 h-3.5 w-3.5" />
          )}
          Log
        </Button>
      )}
    </div>
  );
}
