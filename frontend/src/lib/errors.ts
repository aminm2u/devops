/**
 * Extract a server error message from an axios error: `data.error`, then
 * `data.message`, then `err.message`, then the fallback. Use in every
 * mutation catch block / onError handler instead of hand-writing the chain.
 */
export function errMessage(err: unknown, fallback: string): string {
  const e = err as {
    response?: { data?: { error?: string; message?: string } };
    message?: string;
  };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback;
}
