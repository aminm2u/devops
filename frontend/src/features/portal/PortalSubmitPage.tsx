import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Turnstile } from '@marsidev/react-turnstile';
import { Headphones, Loader2, CheckCircle, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { portalApi } from '@/api/portalClient';

/**
 * Public ticket submission. The Turnstile site key comes from
 * GET /helpdesk/portal/config — the same endpoint decides whether the
 * portal is open at all, so a disabled portal shows the unavailable card
 * without any submit path being reachable.
 */
export function PortalSubmitPage() {
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['portal-config'],
    queryFn: () => portalApi.config(),
    staleTime: 60_000,
    retry: 1,
  });

  const [form, setForm] = useState({
    title: '',
    description: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
    priority: 'medium',
  });
  const [captchaToken, setCaptchaToken] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ ticketNumber: string | null; publicId: string | null } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!captchaToken) {
      setError('Please complete the captcha first.');
      return;
    }
    setSubmitting(true);
    try {
      const ticket = await portalApi.submitTicket({
        title: form.title,
        description: form.description || undefined,
        contactName: form.contactName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone || undefined,
        priority: form.priority,
        turnstileToken: captchaToken,
      });
      setCreated({ ticketNumber: ticket.ticketNumber, publicId: ticket.publicId });
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string; errors?: Record<string, string[]> } } };
      const fieldError = ax.response?.data?.errors && Object.values(ax.response.data.errors).flat()[0];
      setError(fieldError || ax.response?.data?.error || 'Could not submit the ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (configLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config?.enabled) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Portal unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The support portal is not open right now. Please contact us by email or phone instead.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (created) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <CheckCircle className="mb-4 h-12 w-12 text-green-600" />
          <h2 className="text-lg font-semibold">Ticket submitted</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Your ticket number is{' '}
            <span className="font-mono font-semibold text-foreground">{created.ticketNumber}</span>.
            We sent a confirmation to {form.contactEmail}.
          </p>
          <div className="mt-6 flex gap-2">
            <Button asChild>
              <Link to="/portal/track">Track this ticket</Link>
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Submit another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Headphones className="h-5 w-5" />
          Submit a support ticket
        </CardTitle>
        <CardDescription>
          Describe the issue and our team will pick it up. You&apos;ll get a ticket
          number by email — use it to follow up any time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pt-title">Title *</Label>
            <Input
              id="pt-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Brief description of the issue"
              required
              minLength={3}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pt-desc">Description</Label>
            <Textarea
              id="pt-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What happened? What did you expect? Any error messages?"
              rows={5}
              maxLength={10_000}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pt-name">Your name *</Label>
              <Input
                id="pt-name"
                value={form.contactName}
                onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                placeholder="Full name"
                required
                maxLength={120}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pt-email">Email *</Label>
              <Input
                id="pt-email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                placeholder="you@example.com"
                required
                maxLength={254}
              />
              <p className="text-xs text-muted-foreground">
                Used to send your confirmation and follow-up replies.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="pt-phone">Phone (optional)</Label>
              <Input
                id="pt-phone"
                type="tel"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                placeholder="Phone number"
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-center py-2">
            <Turnstile
              siteKey={config.turnstileSiteKey}
              onSuccess={(token) => setCaptchaToken(token)}
              onExpire={() => setCaptchaToken('')}
              options={{ theme: 'auto' }}
            />
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={submitting || !captchaToken}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit ticket
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
