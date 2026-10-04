import type { User } from "@/types/api";
import { trackAdConversion } from "./ads";
import { attributionChannel } from "./attribution";
import { track } from "./analytics";

/**
 * How recently an account must have been created for a Google or Apple sign-in to
 * count as a SIGNUP. Generous on purpose: the redirect flow (website, Google, back to
 * /auth/callback) can take a minute or two, and a device clock a few minutes off must
 * not turn a real signup into a sign-in.
 */
const NEW_ACCOUNT_WINDOW_MS = 10 * 60_000;

/**
 * Report `signup_completed` after a Google or Apple sign-in, if that sign-in just
 * created the account.
 *
 * The OAuth endpoints sign up AND sign in through one call and do not say which
 * happened, so the account's own createdAt decides. Before this, only the email and
 * password form reported a signup, and every Google or Apple signup reached Google Ads
 * and PostHog as nothing at all. The ad conversion is guarded once-per-browser inside
 * lib/ads.ts; callers must call this only on a fresh sign-in, never on a rehydrate.
 */
export function reportSignupIfNew(user: Pick<User, "createdAt" | "email"> | null | undefined, method: "google" | "apple"): void {
  if (!user?.createdAt) return;
  const age = Math.abs(Date.now() - Date.parse(user.createdAt));
  if (!(age < NEW_ACCOUNT_WINDOW_MS)) return;
  track("signup_completed", { method, channel: attributionChannel() });
  trackAdConversion("signup_completed", { email: user.email });
}
