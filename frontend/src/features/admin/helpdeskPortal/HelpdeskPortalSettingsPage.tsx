import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Loader2, ExternalLink, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import toast from '@/lib/toast';
import apiClient from '@/api/client';

/**
 * Helpdesk portal configuration. Rendered as the "Helpdesk Portal" tab of
 * the system Settings page (superadmin-only) — the page wrapper used to live
 * on its own route and was folded into Settings when the portal gained its
 * auto-reply template.
 *
 * Backed by the generic `Setting` table under the `helpdesk_portal` group —
 * saved through the existing bulk `PUT /api/settings` route, so this is pure
 * UI. The Turnstile secret renders masked and never re-fills from the
 * server value: leaving it untouched on save keeps whatever is stored.
 */

const SETTING_PREFIX = 'helpdesk_portal.';

interface PortalSettings {
  enabled: boolean;
  subdomain: string;
  turnstileSiteKey: string;
  turnstileSecretKey: string; // write-only in practice — see mask handling below
  staffNotifyEmail: string;
  autoReplyTemplate: string;
}

const DEFAULTS: PortalSettings = {
  enabled: false,
  subdomain: '',
  turnstileSiteKey: '1x00000000000000000000AA',
  turnstileSecretKey: '1x0000000000000000000000000000000AA',
  staffNotifyEmail: '',
  autoReplyTemplate: '',
};

export function HelpdeskPortalSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<PortalSettings>(DEFAULTS);
  const [secretInput, setSecretInput] = useState('');
  const [secretDirty, setSecretDirty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data: settingsMap, isLoading } = useQuery({
    queryKey: ['helpdesk-portal-settings'],
    queryFn: async () => {
      const res = await apiClient.get('/settings');
      return res.data as Record<string, unknown>;
    },
  });

  useEffect(() => {
    if (!settingsMap || loaded) return;
    const read = <T,>(key: string, fallback: T): T =>
      (settingsMap[`${SETTING_PREFIX}${key}`] as T | undefined) ?? fallback;
    setForm({
      enabled: read<boolean>('enabled', DEFAULTS.enabled),
      subdomain: read<string>('subdomain', DEFAULTS.subdomain),
      turnstileSiteKey: read<string>('turnstileSiteKey', DEFAULTS.turnstileSiteKey),
      turnstileSecretKey: DEFAULTS.turnstileSecretKey,
      staffNotifyEmail: read<string>('staffNotifyEmail', DEFAULTS.staffNotifyEmail),
      autoReplyTemplate: read<string>('autoReplyTemplate', DEFAULTS.autoReplyTemplate),
    });
    setLoaded(true);
  }, [settingsMap, loaded]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // The bulk settings route expects `{ settings: [{key, value, group}] }` —
      // a flat `{key: value}` map fails validation ("settings Required").
      const entries: Array<{ key: string; value: unknown; group: string }> = [
        { key: `${SETTING_PREFIX}enabled`, value: form.enabled, group: 'helpdesk_portal' },
        { key: `${SETTING_PREFIX}subdomain`, value: form.subdomain, group: 'helpdesk_portal' },
        { key: `${SETTING_PREFIX}turnstileSiteKey`, value: form.turnstileSiteKey, group: 'helpdesk_portal' },
        { key: `${SETTING_PREFIX}staffNotifyEmail`, value: form.staffNotifyEmail, group: 'helpdesk_portal' },
        { key: `${SETTING_PREFIX}autoReplyTemplate`, value: form.autoReplyTemplate, group: 'helpdesk_portal' },
      ];
      if (secretDirty && secretInput.trim()) {
        entries.push({
          key: `${SETTING_PREFIX}turnstileSecretKey`,
          value: secretInput.trim(),
          group: 'helpdesk_portal',
        });
      }
      await apiClient.put('/settings', { settings: entries });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['helpdesk-portal-settings'] });
      toast.success('Portal settings saved');
      setSecretDirty(false);
      setSecretInput('');
    },
    onError: () => toast.error('Failed to save portal settings'),
  });

  const portalUrl = form.subdomain ? `https://${form.subdomain}/portal` : null;

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-4 w-4" />
          External portal
        </CardTitle>
        <CardDescription>
          Public ticket submission for people outside the platform. Tickets land
          unassigned in the Helpdesk Queue; reporters follow up by email code.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 mt-2">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base dark:text-gray-400 text-gray-800">Enable portal</Label>
            <p className="text-xs text-muted-foreground">
              Turning this off immediately blocks all portal endpoints — including
              existing external sessions.
            </p>
          </div>
          <Switch
            checked={form.enabled}
            onCheckedChange={(checked) => setForm({ ...form, enabled: checked })}
          />
        </div>

        <Separator />

        {/* Subdomain and staff email sit side by side on wide screens — both are
            single-line inputs and pairing them keeps the form on one screenful. */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="portal-subdomain" className="dark:text-gray-400 text-gray-800">
              Portal subdomain
            </Label>
            <Input
              id="portal-subdomain"
              value={form.subdomain}
              onChange={(e) => setForm({ ...form, subdomain: e.target.value })}
              placeholder="helpdesk.yourcompany.com"
            />
            <p className="text-xs text-muted-foreground">
              Used in email links and shown here. The DNS record and nginx host
              routing must match — see docs/helpdesk-portal.md.
            </p>
            {portalUrl && (
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                {portalUrl} <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="portal-staff-email" className="dark:text-gray-400 text-gray-800">
              Staff notification email(s)
            </Label>
            <Input
              id="portal-staff-email"
              value={form.staffNotifyEmail}
              onChange={(e) => setForm({ ...form, staffNotifyEmail: e.target.value })}
              placeholder="support@yourcompany.com, backup@yourcompany.com"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated. Each portal submission is emailed here in addition to
              the in-app notifications.
            </p>
          </div>
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="portal-autoreply" className="dark:text-gray-400 text-gray-800">
              Auto-reply template
            </Label>
            {!form.autoReplyTemplate && (
              <span className="text-xs text-muted-foreground">Using built-in default</span>
            )}
          </div>
          <Textarea
            id="portal-autoreply"
            value={form.autoReplyTemplate}
            onChange={(e) => setForm({ ...form, autoReplyTemplate: e.target.value })}
            placeholder={
              'Hi {name},\n\nWe received your ticket "{title}" ({ticketNumber}). Our team will pick it up shortly.\n\nTrack it any time: {portalUrl}'
            }
            rows={10}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Sent to the reporter the moment their ticket lands. Leave empty to use
            the built-in default. Placeholders:{' '}
            <code className="rounded bg-muted px-1">{'{name}'}</code>{' '}
            <code className="rounded bg-muted px-1">{'{ticketNumber}'}</code>{' '}
            <code className="rounded bg-muted px-1">{'{title}'}</code>{' '}
            <code className="rounded bg-muted px-1">{'{email}'}</code>{' '}
            <code className="rounded bg-muted px-1">{'{portalUrl}'}</code>
          </p>
        </div>

        <Separator />

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <Label className="text-base">Cloudflare Turnstile</Label>
                <p className="text-xs text-muted-foreground">
                  Protects the public forms from bots. Test keys (always pass) are
                  pre-filled — replace them with your real keys from the Cloudflare
                  dashboard before going live.
                </p>
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-site-key" className="dark:text-gray-400 text-gray-800">
              Site key (public)
            </Label>
            <Input
              id="portal-site-key"
              value={form.turnstileSiteKey}
              onChange={(e) => setForm({ ...form, turnstileSiteKey: e.target.value })}
              className="font-mono text-sm"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="portal-secret-key" className="dark:text-gray-400 text-gray-800">
              Secret key (server-side)
            </Label>
            <Input
              id="portal-secret-key"
              type="password"
              value={secretDirty ? secretInput : ''}
              onChange={(e) => {
                setSecretInput(e.target.value);
                setSecretDirty(true);
              }}
              placeholder={secretDirty ? '' : 'Stored — enter a new key to replace'}
              className="font-mono text-sm"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Write-only: leave empty to keep the stored key.
            </p>
          </div>
        </div>

        <div className="flex justify-end border-t dark:border-gray-600 pt-4">
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
