import prisma from "../config/database.js";

/**
 * Helpdesk portal configuration keys, stored in the generic `Setting` table
 * under a dedicated group. Written by the superadmin config page through the
 * existing `PUT /api/settings` bulk route.
 *
 * Defaults live here rather than in the seeder so a database that predates
 * the portal still reads sensibly: the portal is off and the Turnstile test
 * keys are in place, meaning dev works with zero configuration.
 */
export const PORTAL_SETTING_PREFIX = "helpdesk_portal.";

export interface HelpdeskPortalConfig {
  enabled: boolean;
  subdomain: string;
  turnstileSiteKey: string;
  turnstileSecretKey: string;
  staffNotifyEmail: string;
  /** Custom auto-reply body sent to the reporter on submission. Placeholders:
   *  {name} {ticketNumber} {title} {email} {portalUrl}. Empty = built-in default. */
  autoReplyTemplate: string;
}

/**
 * Cloudflare's public always-pass test keys. Rendered in the widget and used
 * by `verifyTurnstile` respectively — safe to expose, they exist so local
 * development needs no Cloudflare account.
 */
const TEST_SITE_KEY = "1x00000000000000000000AA";
const TEST_SECRET_KEY = "1x0000000000000000000000000000000AA";

export const PORTAL_DEFAULTS: HelpdeskPortalConfig = {
  enabled: false,
  subdomain: "",
  turnstileSiteKey: TEST_SITE_KEY,
  turnstileSecretKey: TEST_SECRET_KEY,
  staffNotifyEmail: "",
  autoReplyTemplate: "",
};

function coerceBool(value: unknown): boolean {
  return value === true || value === "true" || value === "1";
}

export async function getPortalConfig(): Promise<HelpdeskPortalConfig> {
  const rows = await prisma.setting.findMany({
    where: { key: { startsWith: PORTAL_SETTING_PREFIX } },
  });

  const map = new Map(rows.map((row) => [row.key, row.value]));
  const read = (suffix: keyof HelpdeskPortalConfig): unknown =>
    map.get(`${PORTAL_SETTING_PREFIX}${suffix}`);

  return {
    enabled: coerceBool(read("enabled") ?? PORTAL_DEFAULTS.enabled),
    subdomain: String(read("subdomain") ?? PORTAL_DEFAULTS.subdomain),
    turnstileSiteKey: String(
      read("turnstileSiteKey") ?? PORTAL_DEFAULTS.turnstileSiteKey
    ),
    turnstileSecretKey: String(
      read("turnstileSecretKey") ?? PORTAL_DEFAULTS.turnstileSecretKey
    ),
    staffNotifyEmail: String(
      read("staffNotifyEmail") ?? PORTAL_DEFAULTS.staffNotifyEmail
    ),
    autoReplyTemplate: String(
      read("autoReplyTemplate") ?? PORTAL_DEFAULTS.autoReplyTemplate
    ),
  };
}

/**
 * The subset an anonymous visitor may see — the widget's site key and
 * whether the portal is open at all. The secret key and staff notify
 * address never leave the authenticated settings surface.
 */
export async function getPublicPortalConfig(): Promise<{
  enabled: boolean;
  subdomain: string;
  turnstileSiteKey: string;
}> {
  const config = await getPortalConfig();
  return {
    enabled: config.enabled,
    subdomain: config.subdomain,
    turnstileSiteKey: config.turnstileSiteKey,
  };
}
