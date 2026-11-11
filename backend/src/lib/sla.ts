import crypto from "crypto";

/**
 * Shared SLA targets by ticket priority, in hours.
 *
 * Extracted from the internal create route so the external portal issues the
 * same promises to its reporters — a priority means the same deadline whether
 * the ticket came from staff or from the public portal.
 */
export function slaHoursForPriority(priority: string): {
  response: number;
  resolution: number;
} {
  switch (priority) {
    case "urgent":
      return { response: 1, resolution: 4 };
    case "high":
      return { response: 2, resolution: 8 };
    case "low":
      return { response: 8, resolution: 48 };
    case "medium":
    default:
      return { response: 4, resolution: 24 };
  }
}

export function computeSlaTimestamps(priority: string, now: Date): {
  slaResponseAt: Date;
  slaResolutionAt: Date;
} {
  const { response, resolution } = slaHoursForPriority(priority);
  return {
    slaResponseAt: new Date(now.getTime() + response * 60 * 60 * 1000),
    slaResolutionAt: new Date(now.getTime() + resolution * 60 * 60 * 1000),
  };
}

/** SHA-256 hex digest — how OTP codes and portal tokens are stored at rest. */
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** Cryptographically strong 6-digit OTP. */
export function generateOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/** 256 bits of entropy, URL-safe — the opaque portal session token. */
export function generatePortalToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
