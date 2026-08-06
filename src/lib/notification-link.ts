/**
 * Turning a notification's `link` into somewhere this console can actually go.
 *
 * `notification.link` is a **Flutter go_router location** — it is written by the server for
 * the mobile app's resolver, and the two clients do not share a route vocabulary. The app
 * says `/personnel/42`; the console says `/people/42`. That mismatch is why the inbox has
 * ignored the field entirely since it was built, and why every notification row in the web
 * console is currently a dead end: you can see that something happened and you cannot click
 * through to it.
 *
 * This is deliberately an ALLOWLIST that returns null for anything it does not recognise,
 * and not a best-effort rewrite. There are ~81 notification creation sites on the server
 * emitting a dozen link shapes, several of which point at screens the console does not have
 * at all. Guessing would send somebody to a 404 from a notification, which is worse than
 * the current dead end. Rows whose link is not listed here behave exactly as they do today.
 *
 * Add a shape here when you add a notification — and only after checking the console has
 * the destination. The Flutter side has the mirror-image obligation, in
 * `app/lib/helpers/firebase_messaging_helper.dart`, where an unlisted location silently
 * falls back to Home.
 */

/** Flutter location → console route, for links with no trailing id. */
const EXACT: Record<string, string> = {
  "/personnel": "/people",
};

/**
 * Flutter parent → console parent, for the `/parent/123` shape.
 *
 * The trailing segment must parse as an integer, exactly as the app's resolver requires —
 * `/personnel/guests` is a real Flutter location and is NOT a person's record, so a rule
 * that accepted any trailing segment would route it to `/people/guests` and 404.
 */
const WITH_ID: Record<string, string> = {
  "/personnel": "/people",
};

export function notificationHref(link: string | null | undefined): string | null {
  if (!link) return null;

  //Some older creation sites emit an absolute URL. Take the path and treat it the same.
  let path = link;
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }

  //Query strings are a third shape the server uses (`/reservations?id=5`). Nothing here
  //consumes one yet, and silently dropping it would land somebody on the wrong screen, so
  //anything carrying one is left alone until its destination is registered.
  if (path.includes("?")) return null;

  const trimmed = path.replace(/\/+$/, "");
  if (EXACT[trimmed]) return EXACT[trimmed];

  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 2) {
    const parent = `/${segments[0]}`;
    const id = Number(segments[1]);
    if (WITH_ID[parent] && Number.isInteger(id) && String(id) === segments[1]) {
      return `${WITH_ID[parent]}/${id}`;
    }
  }

  return null;
}
