/**
 * Marketing source → what the checklist leads with.
 *
 * Someone who read the QuickBooks page and clicked "Start free" has already told us
 * what they want. Opening on "add your first aircraft" restarts a conversation they
 * were three paragraphs into; opening on billing → QuickBooks → first invoice
 * continues it. The rest of the checklist is still there, just below.
 *
 * This map is the whole feature. The server stores the slug opaquely and never reads
 * it, so launching a campaign means one entry here and a `?src=` on the website's
 * CTA: no migration, no deploy ordering, and an unknown slug degrades to the default
 * order rather than breaking.
 *
 * Landing pages without `?src=` are inferred in `onboarding-intent.ts` before the
 * slug is written at org create.
 */

export type Track = {
  /** Shown above the reordered items, so the ordering isn't mysterious. */
  caption: string;
  /** Checklist item ids to float to the top, in this order. Unknown ids are ignored. */
  lead: string[];
};

export const TRACKS: Record<string, Track> = {
  quickbooks: {
    caption: "You came in from QuickBooks: here's that path first.",
    lead: ["billing", "quickbooks", "invoice"],
  },
  billing: {
    caption: "You came in looking at billing, start here.",
    lead: ["billing", "invoice", "rules"],
  },
  maintenance: {
    caption: "You came in from maintenance tracking, start here.",
    lead: ["maintenance", "aircraft", "groups"],
  },
  clubs: {
    caption: "You came in from flying clubs, start here.",
    lead: ["students", "rules", "reservation"],
  },
  scheduling: {
    caption: "You came in from scheduling, start here.",
    lead: ["aircraft", "reservation", "instructors"],
  },
  training: {
    caption: "You came in for training records, start here.",
    lead: ["training", "students", "instructors"],
  },
  reports: {
    caption: "Reports light up once flights are on the board. Start there.",
    lead: ["aircraft", "reservation", "invoice"],
  },
};

export const trackFor = (source: string | null | undefined): Track | null =>
  (source && TRACKS[source.toLowerCase()]) || null;

/**
 * Reorder ids so the track's items lead. Everything else keeps the catalogue order,
 * which is what makes an unknown or absent source a no-op rather than a special case.
 */
export function orderForTrack(ids: string[], source: string | null | undefined): string[] {
  const track = trackFor(source);
  if (!track) return ids;
  const lead = track.lead.filter((id) => ids.includes(id));
  return [...lead, ...ids.filter((id) => !lead.includes(id))];
}
