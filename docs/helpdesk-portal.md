# Helpdesk External Portal — Operations Runbook

How to take the public ticket portal live. The application side is fully
self-serve from the admin UI; only DNS/WAF/nginx are manual.

## What it is

- **Submission**: anyone on the portal host opens `/portal`, completes a
  Cloudflare Turnstile check and submits a ticket. It lands **Unassigned**
  in the internal Helpdesk Queue (`/devops/helpdesk`) with an **External**
  badge, source `Portal`.
- **Follow-up**: the reporter opens `/portal/track`, enters their email and
  a 6-digit code emailed to them (only if that email actually has tickets —
  the response never reveals either way), then sees their tickets and can
  reply. Internal notes stay invisible to them.
- **Config**: superadmin page at `/admin/helpdesk-portal` — enable/disable,
  subdomain, Turnstile keys, staff notify email.

## One-time go-live steps

1. **DNS** — create an A/CNAME record for the chosen subdomain
   (e.g. `helpdesk.example.com`) pointing at the WAF.
2. **WAF** — add a route rule for that host forwarding to this origin
   (HTTP origin; TLS terminates at the WAF, and its certificate must cover
   the subdomain — wildcard or SAN).
3. **Nginx** — no config change needed: `nginx/nginx.conf` has a
   `server_name helpdesk.*;` block that wins over the catch-all for any
   `helpdesk.` host. Reload after any future conf change:
   `docker compose exec nginx nginx -s reload`.
4. **Cloudflare Turnstile** — create a widget in the Cloudflare dashboard,
   then in `/admin/helpdesk-portal` replace the pre-filled **test keys**
   (`1x0000…AA` site / `1x0000…AA` secret, which always pass) with the real
   site key + secret key.
5. **Staff email** — set the notification address(es) that get an email per
   portal submission (optional; in-app notifications fire regardless).
6. **Flip enable** — toggle the portal on in `/admin/helpdesk-portal`.
   Turning it off again instantly blocks all portal endpoints, including
   already-issued external sessions.

## Notes and gotchas

- The `subdomain` setting drives email links and display only; it does not
  reconfigure nginx. Keep DNS, WAF and the setting in agreement.
- Portal sessions are opaque tokens stored hashed in
  `helpdesk_portal_sessions` — 12 h TTL, killed by re-requesting an OTP or
  disabling the portal. Browsers keep them in `sessionStorage`, so closing
  the tab signs the reporter out.
- In dev without `SMTP_HOST`, the OTP is printed in the backend logs
  (`[Portal] Dev OTP for <email>: <code>`). Turnstile test keys work against
  the real siteverify endpoint, so local E2E needs no Cloudflare account.
- Rate limits: per-route express limits (5 tickets/h/IP, 5 OTP requests/h/IP,
  10 confirms/h/IP) plus an nginx `portal` zone (1 r/s burst 10) on
  `/api/helpdesk/portal/`.
