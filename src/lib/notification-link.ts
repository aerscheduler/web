/**
 * Turning a notification's `link` into somewhere this console can actually go.
 *
 * `notification.link` is a **Flutter go_router location**. It is written by the server for
 * the mobile app's resolver, and the two clients do not share a route vocabulary. The app
 * says `/personnel/42`; the console says `/people/42`. The app says `/invoices/91`; the
 * console has no such page and shows that invoice at `/me/invoices?invoice=91`. That
 * mismatch is why the inbox ignored the field for so long, and why a notification row in
 * the console was a dead end: you could see that something happened and could not click
 * through to it.
 *
 * This is deliberately an ALLOWLIST that returns null for anything it does not recognise,
 * and not a best-effort rewrite. Guessing would send somebody from a notification to a 404
 * or, worse, to a page their role bounces them off, which is a worse experience than the
 * dead end. Every entry below was checked twice: that the console HAS the destination, and
 * that the people who receive that notification can actually reach it.
 *
 * The role check is the part that is easy to get wrong. `/invoices/:id` is sent to the
 * person being BILLED, who is usually a student, so it goes to `/me/invoices` and not to
 * `/billing` (admin-only, and it would redirect them to `/me`). `/settings` is emitted for
 * an invitation and is deliberately absent for the same reason: console Settings is
 * admin-only and is not where an invitee joins a school.
 *
 * Add a shape here when you add a notification, and only after checking both of those
 * things. The Flutter side has the mirror-image obligation, in
 * `app/lib/helpers/firebase_messaging_helper.dart`, where an unlisted location silently
 * falls back to Home.
 */

/**
 * A fully built console href, handed to the router's `href` navigation.
 *
 * A plain string rather than `{ to, search }` because `to` is typed against the generated
 * route tree and these paths are only known at runtime. The query values below are written
 * bare (`?invoice=91`, `?tab=billing`) because that is exactly what the router's own search
 * serializer produces: it JSON-encodes, so a number stays `91` and an unquoted word parses
 * back as the string it looks like. Quoting either would give `%2291%22`, which no route
 * here reads.
 */
export type NotificationHref = string;

/** Flutter location → console destination, for links with no trailing id. */
const EXACT: Record<string, NotificationHref | undefined> = {
  "/personnel": "/people",
  "/reservations": "/schedule",
  //Announcements live under Operations in the console. Open to any member, same as the
  //notice itself.
  "/announcements": "/operations/announcements",
  //Currency reminders are about the recipient's OWN currency, so they land on their own
  //page rather than on a roster.
  "/currencies": "/me/currencies",
  //Owner-only notification, and console Settings is admin-gated, so the audiences match.
  "/organization-settings/billing": "/settings?tab=billing",
  //Deletion countdown notices go to admins and owners; console Settings is admin-gated.
  "/organization-settings": "/settings?tab=organization",
  //Automatic dunning handoff: admins/owners only. App org-invoice list; console Billing.
  "/organization-invoices": "/billing",
  // Slot-offer list (no id). Same destination as /slot-offers/:id.
  "/slot-offers": "/me/schedule?tab=offers",
};

/**
 * Flutter parent → console destination, for the `/parent/123` shape.
 *
 * The trailing segment must parse as an integer, exactly as the app's resolver requires.
 * `/personnel/guests` is a real Flutter location and is NOT a person's record, so a rule
 * that accepted any trailing segment would route it to `/people/guests` and 404.
 */
const WITH_ID: Record<string, ((id: number) => NotificationHref) | undefined> = {
  "/personnel": (id) => `/people/${id}`,
  //`sendSquawkCreated` emits `/squawks/:id`. It was unlisted here for as long as the
  //console had no per-squawk page. It has one now, at the same path the app uses.
  "/squawks": (id) => `/maintenance/squawks/${id}`,
  //Sent to whoever is being billed, which is normally a student. `/billing` is the
  //administrator's ledger of everyone and would bounce them; this is their own copy, and
  //it opens the same invoice for an admin who is also the customer.
  "/invoices": (id) => `/me/invoices?invoice=${id}`,
  //No per-reminder route exists in the console, so this lands on the inspections list
  //rather than nowhere. Reminder notifications go to technicians and administrators,
  //which is exactly who `/maintenance` admits.
  "/reminders": () => "/maintenance?view=reminders",
  //A document expiry is about the recipient's own paperwork. There is no per-document
  //page on either surface; the app's link opens the list too.
  "/documents": () => "/me/documents",
  "/currencies": () => "/me/currencies",
  // Member list lives under Schedule; offer detail is not a separate console page.
  "/slot-offers": () => `/me/schedule?tab=offers`,
};

/**
 * `parent?id=N` links, which the server emits for reservations.
 *
 * Kept separate from the path shapes because the id is the QUERY value here, and because
 * the console's own key is different (`?reservation=`, not `?id=`). Dropping the query and
 * landing on the bare board was the old behaviour and is not good enough: the whole point
 * of the notification is the one booking it names.
 */
const WITH_QUERY_ID: Record<string, ((id: number) => NotificationHref) | undefined> = {
  "/reservations": (id) => `/schedule?reservation=${id}`,
  //Automatic dunning handoff to admins/owners. App opens the org invoice list (query ignored);
  //console opens the Billing detail panel for that invoice.
  "/organization-invoices": (id) => `/billing?invoice=${id}`,
};

/** An integer id, and only if the segment was written as one (no "5abc", no "5.0"). */
function parseId(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const id = Number(raw);
  return Number.isInteger(id) && String(id) === raw ? id : null;
}

export function notificationHref(link: string | null | undefined): NotificationHref | null {
  if (!link) return null;

  //Some older creation sites emit an absolute URL. Take the path and treat it the same.
  let path = link;
  let query = "";
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path);
      path = url.pathname;
      query = url.search.replace(/^\?/, "");
    } catch {
      return null;
    }
  }

  const queryAt = path.indexOf("?");
  if (queryAt >= 0) {
    query = path.slice(queryAt + 1);
    path = path.slice(0, queryAt);
  }

  const trimmed = path.replace(/\/+$/, "");

  if (query) {
    const id = parseId(new URLSearchParams(query).get("id"));
    const build = WITH_QUERY_ID[trimmed];
    //A query this table does not understand is left alone rather than silently dropped:
    //landing on the unfiltered page is not what the row promised.
    return build && id != null ? build(id) : null;
  }

  const exact = EXACT[trimmed];
  if (exact) return exact;

  const segments = trimmed.split("/").filter(Boolean);
  if (segments.length === 2) {
    const build = WITH_ID[`/${segments[0]}`];
    const id = parseId(segments[1]);
    if (build && id != null) return build(id);
  }

  return null;
}
