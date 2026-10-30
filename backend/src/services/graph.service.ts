/**
 * Microsoft Graph service — Entra ID OAuth2 + calendar operations.
 *
 * Tokens and app secrets are encrypted with the same AES-256-CBC scheme
 * used by the credential module (key derived from JWT_SECRET).
 */
import axios from "axios";
import crypto from "crypto";
import prisma from "../config/database.js";

// ---------- token / secret encryption (mirrors credential.routes.ts) ----------

const ENCRYPTION_KEY =
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  "default-devops-platform-key-change-in-production";
const ALGORITHM = "aes-256-cbc";

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "salt-devops-credentials", 32);
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, deriveKey(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  try {
    const [ivHex, encrypted] = encryptedText.split(":");
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      deriveKey(ENCRYPTION_KEY),
      Buffer.from(ivHex, "hex")
    );
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // Legacy plaintext values
    return encryptedText;
  }
}

// ---------- tenant app registration (admin-level, stored in Settings) ----------

export const MS_CONFIG_KEY = "microsoft_graph";

export interface MicrosoftAppConfig {
  tenantId: string; // "common" for multi-tenant, or a tenant GUID / domain
  clientId: string;
  clientSecret: string; // stored encrypted
  redirectUri?: string; // optional override; defaults to APP_URL + /api/microsoft/callback
}

export async function getAppConfig(): Promise<MicrosoftAppConfig | null> {
  const setting = await prisma.setting.findUnique({ where: { key: MS_CONFIG_KEY } });
  if (!setting || !setting.value) return null;
  try {
    const raw = typeof setting.value === "string" ? JSON.parse(setting.value) : setting.value;
    if (!raw?.clientId || !raw?.tenantId) return null;
    return {
      tenantId: raw.tenantId,
      clientId: raw.clientId,
      clientSecret: raw.clientSecret ? decrypt(raw.clientSecret) : "",
      redirectUri: raw.redirectUri || undefined,
    };
  } catch {
    return null;
  }
}

export async function saveAppConfig(config: {
  tenantId: string;
  clientId: string;
  clientSecret?: string;
  redirectUri?: string;
}): Promise<void> {
  const existing = await prisma.setting.findUnique({ where: { key: MS_CONFIG_KEY } });
  let secretEncrypted: string | undefined;
  if (config.clientSecret) {
    secretEncrypted = encrypt(config.clientSecret);
  } else if (existing) {
    // Keep the previously stored secret when the field is left blank
    try {
      const raw = typeof existing.value === "string" ? JSON.parse(existing.value) : existing.value;
      secretEncrypted = raw?.clientSecret;
    } catch {
      secretEncrypted = undefined;
    }
  }

  const value: Record<string, unknown> = {
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecret: secretEncrypted ?? "",
    redirectUri: config.redirectUri || "",
  };

  await prisma.setting.upsert({
    where: { key: MS_CONFIG_KEY },
    update: { value: value as any },
    create: { key: MS_CONFIG_KEY, value: value as any, group: "integration" },
  });
}

export function callbackUrl(config: MicrosoftAppConfig): string {
  if (config.redirectUri) return config.redirectUri;
  const appUrl = (process.env.APP_URL || "http://localhost:8080").replace(/\/$/, "");
  return `${appUrl}/api/microsoft/callback`;
}

// ---------- OAuth helpers ----------

export const MS_SCOPES = ["offline_access", "User.Read", "Calendars.Read"];

export function buildAuthorizeUrl(
  config: MicrosoftAppConfig,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: callbackUrl(config),
    response_mode: "query",
    scope: MS_SCOPES.join(" "),
    state,
  });
  return `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/authorize?${params}`;
}

/** Sign a short-lived state payload so the callback can trust it. */
export function signState(userId: number): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, ts: Date.now() })
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", ENCRYPTION_KEY)
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): { userId: number } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) return null;
  const expected = crypto
    .createHmac("sha256", ENCRYPTION_KEY)
    .update(payload)
    .digest("base64url");
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    // State valid for 10 minutes
    if (Date.now() - data.ts > 10 * 60 * 1000) return null;
    return { userId: Number(data.userId) };
  } catch {
    return null;
  }
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(
  config: MicrosoftAppConfig,
  body: Record<string, string>
): Promise<TokenResponse> {
  const tokenUrl = `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`;
  const res = await axios.post(tokenUrl, new URLSearchParams(body).toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000,
  });
  return res.data;
}

/** Exchange an authorization code for tokens and persist the account link. */
export async function exchangeCodeAndLinkAccount(
  userId: number,
  code: string
): Promise<void> {
  const config = await getAppConfig();
  if (!config) throw new Error("Microsoft integration is not configured");

  const tokens = await tokenRequest(config, {
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: callbackUrl(config),
    grant_type: "authorization_code",
  });

  // Fetch the signed-in user's profile from Graph
  const profileRes = await axios.get("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    timeout: 15000,
  });
  const me = profileRes.data as { id: string; mail?: string; userPrincipalName: string; displayName?: string };

  await prisma.microsoftAccount.upsert({
    where: { userId },
    update: {
      msUserId: me.id,
      email: me.mail || me.userPrincipalName,
      displayName: me.displayName || null,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : undefined,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
    create: {
      userId,
      msUserId: me.id,
      email: me.mail || me.userPrincipalName,
      displayName: me.displayName || null,
      accessToken: encrypt(tokens.access_token),
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    },
  });
}

/** Return a valid access token for the user, refreshing when close to expiry. */
export async function getValidAccessToken(userId: number): Promise<string | null> {
  const account = await prisma.microsoftAccount.findUnique({ where: { userId } });
  if (!account) return null;

  const expiresSoon =
    account.tokenExpiresAt.getTime() - Date.now() < 5 * 60 * 1000;
  if (!expiresSoon) return decrypt(account.accessToken);

  if (!account.refreshToken) return null;
  const config = await getAppConfig();
  if (!config) return null;

  try {
    const tokens = await tokenRequest(config, {
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: decrypt(account.refreshToken),
      grant_type: "refresh_token",
    });
    await prisma.microsoftAccount.update({
      where: { userId },
      data: {
        accessToken: encrypt(tokens.access_token),
        ...(tokens.refresh_token
          ? { refreshToken: encrypt(tokens.refresh_token) }
          : {}),
        tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token;
  } catch (e) {
    console.error("[Microsoft] Token refresh failed:", (e as Error).message);
    return null;
  }
}

// ---------- Calendar operations ----------

export interface GraphCalendarEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  isOnlineMeeting: boolean;
  onlineMeeting?: { joinUrl?: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
}

/**
 * Fetch calendarView for a window. We ask Graph to render times in UTC
 * (Prefer header) so the returned dateTime strings are unambiguous.
 */
export async function fetchCalendarView(
  accessToken: string,
  from: Date,
  to: Date
): Promise<GraphCalendarEvent[]> {
  const params = new URLSearchParams({
    startDateTime: from.toISOString(),
    endDateTime: to.toISOString(),
    $select: "id,subject,start,end,isOnlineMeeting,onlineMeeting,organizer",
    $orderby: "start/dateTime",
    $top: "200",
  });
  const res = await axios.get(
    `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
      },
      timeout: 20000,
    }
  );
  return (res.data?.value ?? []) as GraphCalendarEvent[];
}

export function parseGraphDateTime(dt: { dateTime: string }): Date {
  // Graph returns e.g. "2026-10-30T09:00:00.0000000"; with the UTC Prefer
  // header there is no offset suffix, so treat it as UTC.
  const raw = dt.dateTime.replace(/\.0+$/, "");
  return new Date(`${raw}${raw.endsWith("Z") ? "" : "Z"}`);
}

/** Round to the nearest quarter hour, capped at 24h. */
export function snapHours(hours: number): number {
  const snapped = Math.round(hours * 4) / 4;
  return Math.min(24, Math.max(0.25, snapped));
}
