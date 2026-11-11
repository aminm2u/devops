import { getPortalConfig } from "../services/helpdeskPortalSettings.service.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * The Turnstile test secret (`1x0000000000000000000000000000000AA`) passes
 * against the real siteverify endpoint, so dev works with the seeded default
 * without any special-casing here. Fail closed whenever a real secret is
 * configured: a network error or missing token is a captcha failure, not a
 * reason to let the request through.
 */
export async function verifyTurnstile(
  response: unknown,
  ip?: string
): Promise<boolean> {
  if (typeof response !== "string" || !response) return false;

  const { turnstileSecretKey } = await getPortalConfig();
  if (!turnstileSecretKey) {
    // No secret configured at all: allow only outside production so a fresh
    // dev database (no settings rows) is not bricked. Production must set
    // the key — the config page seeds a test secret by default anyway.
    return process.env.NODE_ENV !== "production";
  }

  try {
    const body = new URLSearchParams({
      secret: turnstileSecretKey,
      response,
    });
    if (ip) body.set("remoteip", ip);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error("[Turnstile] verify failed:", err);
    return false;
  }
}
