import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Turnstile } from '@marsidev/react-turnstile';
import { Loader2, MailCheck, KeyRound, ArrowRight, Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { portalApi, getPortalToken, setPortalToken, clearPortalToken, PortalTicketSummary } from '@/api/portalClient';

/**
 * Ticket tracking: email → emailed code → ticket list, in one page.
 *
 * The server deliberately answers "code sent" whether or not the address has
 * tickets, so this UI never claims otherwise — the neutral copy is part of
 * the anti-enumeration design, not vagueness.
 */
export function PortalTrackPage() {
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['portal-config'],
    queryFn: () => portalApi.config(),
    staleTime: 60_000,
    retry: 1,
  });

  // An unexpired session goes straight to the list.
  const [sessionEmail, setSessionEmail] = useState<string | null>(() =>
    getPortalToken() ? 'session' : null
  );
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (configLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (config && !config.enabled) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center py-16 text-center">
          <h2 className="text-lg font-semibold">Portal unavailable</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The support portal is not open right now.
          </p>
        </CardContent>
      </Card>
    );
  }

  const requestOtp = async () => {
    setError(null);
    setInfo(null);
    if (!captchaToken) {
      setError('Please complete the captcha first.');
      return;
    }
    setBusy(true);
    try {
      await portalApi.requestOtp(email, captchaToken);
      setStage('code');
      setResendIn(60);
      setInfo('If we have tickets for this email address, a code has been sent. It expires in 10 minutes.');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Could not send the code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmOtp = async () => {
    setError(null);
    setBusy(true);
    try {
      const { token } = await portalApi.confirmOtp(email, code);
      setPortalToken(token);
      setSessionEmail(email);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string } } };
      setError(ax.response?.data?.error || 'Invalid or expired code.');
    } finally {
      setBusy(false);
    }
  };

  if (sessionEmail) {
    return <TicketList onSignOut={() => { clearPortalToken(); setSessionEmail(null); setStage('email'); setCode(''); }} />;
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MailCheck className="h-5 w-5" />
          Track your tickets
        </CardTitle>
        <CardDescription>
          {stage === 'email'
            ? 'Enter the email you used when submitting your ticket.'
            : `Enter the 6-digit code sent to ${email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {stage === 'email' ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="pt-track-email">Email</Label>
              <Input
                id="pt-track-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                maxLength={254}
              />
            </div>
            <div className="flex justify-center py-1">
              <Turnstile
                siteKey={config?.turnstileSiteKey ?? '1x00000000000000000000AA'}
                onSuccess={(token) => setCaptchaToken(token)}
                onExpire={() => setCaptchaToken('')}
                options={{ theme: 'auto' }}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={requestOtp} disabled={busy || !email || !captchaToken}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MailCheck className="mr-2 h-4 w-4" />}
              Send access code
            </Button>
          </>
        ) : (
          <>
            {info && <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{info}</p>}
            <div className="space-y-2">
              <Label htmlFor="pt-track-code" className="flex items-center gap-2">
                <KeyRound className="h-4 w-4" /> Access code
              </Label>
              <Input
                id="pt-track-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="text-center font-mono text-lg tracking-[0.5em]"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" onClick={confirmOtp} disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Verify and view tickets
            </Button>
            <div className="flex items-center justify-between text-sm">
              <Button variant="link" className="h-auto p-0" onClick={() => { setStage('email'); setError(null); setInfo(null); }}>
                Use a different email
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || resendIn > 0 || !captchaToken}
                onClick={requestOtp}
              >
                <Timer className="mr-1 h-4 w-4" />
                {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TicketList({ onSignOut }: { onSignOut: () => void }) {
  const navigate = useNavigate();
  const { data: tickets, isLoading, error } = useQuery({
    queryKey: ['portal-tickets'],
    queryFn: () => portalApi.listTickets(),
    retry: false,
  });

  // An expired token lands here as a 401 — drop back to the email stage.
  useEffect(() => {
    if (error) onSignOut();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>Your tickets</CardTitle>
          <CardDescription>Sign-out happens automatically when you close this tab.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={onSignOut}>
          Sign out
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {(tickets ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tickets found for this email address.
          </p>
        ) : (
          (tickets ?? []).map((ticket: PortalTicketSummary) => (
            <button
              key={ticket.id}
              onClick={() => navigate(`/portal/tickets/${ticket.publicId ?? ticket.id}`)}
              className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {ticket.ticketNumber ?? `HD-${ticket.id}`}
                  </span>
                  <StatusBadge domain="helpdeskStatus" value={ticket.status as never} />
                </div>
                <p className="mt-0.5 truncate font-medium">{ticket.title}</p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ))
        )}
        <p className="pt-2 text-center text-xs text-muted-foreground">
          Submitted a new ticket? <Link to="/portal" className="underline">Submit another</Link>
        </p>
      </CardContent>
    </Card>
  );
}
