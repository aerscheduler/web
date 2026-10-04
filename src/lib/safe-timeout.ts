//---------------------------------------------------------------------------------
// setTimeout for delays computed from a date.
//
// Browsers store a timer's delay as a signed 32-bit int. Anything above 2^31-1 ms
// (about 24.8 days) overflows, and the timer fires AT ONCE instead of never. A
// session token lives 30 days, so "reconnect 30s before the token expires" came to
// ~2.59e9 ms and fired immediately: every console tab reconnected in a loop, minting
// a ticket a second, and heard no live updates for the first ~5 days of a session.
//
// Use `safeSetTimeout` whenever the delay is derived from an expiry or any other date
// that can be far away. A clamped timer fires early (after ~24.8 days), so the
// callback must be safe to run before the real deadline, e.g. by re-checking it.
//---------------------------------------------------------------------------------

/** The longest delay setTimeout honours: 2^31-1 ms. */
export const MAX_TIMEOUT_MS = 2_147_483_647;

/** Clamp a delay into what setTimeout honours. NaN waits the maximum rather than firing now. */
export function clampTimeoutDelay(ms: number): number {
  if (Number.isNaN(ms)) return MAX_TIMEOUT_MS;
  return Math.min(MAX_TIMEOUT_MS, Math.max(0, ms));
}

/** `window.setTimeout` that never overflows into firing immediately. */
export function safeSetTimeout(fn: () => void, ms: number): number {
  return window.setTimeout(fn, clampTimeoutDelay(ms));
}
