import rateLimit from "express-rate-limit";

/**
 * Per-route limiters for the public portal endpoints.
 *
 * The global limiter (500 req / 15 min in `index.ts`) is far too generous for
 * an unauthenticated surface, so every portal route gets a tighter cap keyed
 * on IP. The memory store is fine while the backend is a single container; if
 * it ever scales horizontally, swap in a Redis store here (`rate-limit-redis`
 * + the existing `config/redis.ts` client).
 */
function makeLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: options.message },
  });
}

const HOUR = 60 * 60 * 1000;

/** Ticket submission from the public form. */
export const portalTicketLimiter = makeLimiter({
  windowMs: HOUR,
  max: 5,
  message: "Too many tickets submitted from this address. Try again later.",
});

/** OTP request (email + captcha). */
export const portalOtpRequestLimiter = makeLimiter({
  windowMs: HOUR,
  max: 5,
  message: "Too many code requests. Try again later.",
});

/** OTP confirm attempts — on top of the per-code 5-attempt counter. */
export const portalOtpConfirmLimiter = makeLimiter({
  windowMs: HOUR,
  max: 10,
  message: "Too many verification attempts. Try again later.",
});

/** Authenticated portal reads (list, detail). */
export const portalReadLimiter = makeLimiter({
  windowMs: HOUR,
  max: 120,
  message: "Too many requests. Try again later.",
});

/** External replies. */
export const portalCommentLimiter = makeLimiter({
  windowMs: HOUR,
  max: 30,
  message: "Too many replies. Try again later.",
});
