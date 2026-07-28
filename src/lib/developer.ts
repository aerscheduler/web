/**
 * Developer tooling — "log in as" (impersonation) for support and troubleshooting.
 *
 * The SERVER is the authority. `POST /developer/loginAs` sits behind the
 * `isDeveloper()` guard, which checks the caller's email against an allowlist in
 * `UserService.isDeveloper`; everyone else gets a 403. The allowlist is mirrored
 * here for ONE reason: deciding whether to render the Developer UI. Hiding a menu
 * item is cosmetic — it is never the thing keeping anyone out.
 *
 * Keep DEVELOPER_EMAILS in sync with `server/src/services/user.ts:isDeveloper`.
 * Drifting only ever costs a developer a hidden menu item, never access.
 */
export const DEVELOPER_EMAILS = [
  "tonyramirezlecca@gmail.com",
  "dev@aerscheduler.com",
  "quinton@aerscheduler.com",
] as const;

export function isDeveloperEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return (DEVELOPER_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}

/**
 * The developer's own session, parked while they are signed in as someone else
 * so that "exit" is one click rather than a fresh login.
 */
export interface DeveloperStash {
  /** The developer's access token. */
  token: string;
  /** The raw `aer.session` JSON as it stood before impersonating. */
  session: string;
  /** Shown in the banner: "return to dev@aerscheduler.com". */
  developerEmail: string;
}

const STASH_KEY = "aer.devStash";

export function readDevStash(): DeveloperStash | null {
  try {
    const raw = localStorage.getItem(STASH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeveloperStash;
    return parsed?.token && parsed?.session ? parsed : null;
  } catch {
    return null;
  }
}

export function writeDevStash(stash: DeveloperStash) {
  localStorage.setItem(STASH_KEY, JSON.stringify(stash));
}

export function clearDevStash() {
  localStorage.removeItem(STASH_KEY);
}

/**
 * Read the `impersonatedBy` claim the server stamps on impersonation tokens.
 *
 * This decodes without verifying — that is fine and deliberate. The claim drives
 * a banner, nothing more; the server re-verifies the signature on every request.
 * Deriving the banner from the TOKEN rather than from React state means it
 * survives a page refresh, which matters because the whole point is that you
 * always know whose account you are looking at.
 */
export function decodeImpersonatedBy(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;

    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { impersonatedBy?: unknown };

    return typeof claims.impersonatedBy === "number" ? claims.impersonatedBy : null;
  } catch {
    return null;
  }
}
