/**
 * Gathers everything the setup checklist needs and works out where the org stands.
 *
 * One hook so the items stay pure functions of data, no item fires a request of its
 * own, and the same facts drive the dashboard card and the wizard's last screen.
 *
 * Every query here is gated on the checklist actually being live. Once it has been
 * retired (`dismissedAt`), or for anyone who isn't an admin, this costs nothing.
 */

import { useEffect, useMemo, useRef } from "react";
import { addDays, startOfDay } from "date-fns";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import {
  useBilling,
  useInvoices,
  useMaintenanceReminders,
  useMembers,
  useOrgOnboarding,
  usePlanes,
  useQuickBooksSettings,
  useSplitRules,
  useRatings,
  useReservations,
  useResourceGroups,
  useRooms,
  useSimulators,
  useCourses,
  useUpdateOrgOnboarding,
} from "@/features/queries";
import {
  CHECKLIST,
  resolveCopy,
  type ChecklistFacts,
  type ChecklistItem,
  type OrgType,
} from "@/lib/onboarding-checklist";
import { orderForTrack, trackFor, TRACKS } from "@/lib/onboarding-tracks";

export type ChecklistEntry = { item: ChecklistItem; done: boolean; dismissed: boolean };

export type ChecklistState = {
  /** Applicable items in the order to render them, track-first. */
  entries: ChecklistEntry[];
  /** Items still worth doing, not done, not waved off. */
  remaining: ChecklistEntry[];
  done: number;
  total: number;
  percent: number;
  /** Copy explaining a campaign-driven ordering, when there is one. */
  trackCaption: string | null;
  orgType: OrgType;
  /** False when the checklist should not be on screen at all. */
  visible: boolean;
  loading: boolean;
  dismissItem: (id: string) => void;
  restoreItem: (id: string) => void;
};

/**
 * "Has this org ever booked / invoiced?" answered over a window rather than all time.
 *
 * An unbounded list would be the wrong trade: the checklist only exists for operations
 * that are still setting up, and it retires itself for good the moment it completes.
 * so a window wide enough to catch a new school's first booking is wide enough, and it
 * keeps the dashboard from pulling a year of reservations to tick one box.
 */
const LOOKBACK_DAYS = 45;
const LOOKAHEAD_DAYS = 60;

/**
 * Preview overrides, read from the URL.
 *
 * `?track=quickbooks` reorders the list as if the org had arrived from that campaign,
 * and `?checklist=show` brings back a checklist that has already retired itself. Both
 * are display-only, neither writes anything, so previewing a track cannot overwrite
 * the org's real attribution.
 *
 * Same trick, and the same reason, as `?sub=trial|grace|expired` in
 * `components/subscription/plan.tsx`: these are states you would otherwise have to
 * manufacture a whole organization to see. Harmless in prod.
 */
function previewOverrides(): { track: string | null; force: boolean } {
  if (typeof window === "undefined") return { track: null, force: false };
  const p = new URLSearchParams(window.location.search);
  const track = p.get("track");
  return {
    track: track && TRACKS[track.toLowerCase()] ? track.toLowerCase() : null,
    force: p.get("checklist") === "show" || !!track,
  };
}

export function useChecklist(): ChecklistState {
  const { organization, roles } = useAuth();
  const admin = isAdmin(roles);

  const preview = previewOverrides();
  const onboarding = useOrgOnboarding({ enabled: !!organization && admin });
  const retired = Boolean(onboarding.data?.dismissedAt) && !preview.force;
  // Everything below is only worth fetching while the checklist can still appear.
  const live = !!organization && admin && !retired && !onboarding.isLoading;
  const q = { enabled: live };

  const now = new Date();
  const from = startOfDay(addDays(now, -LOOKBACK_DAYS)).toISOString();
  const to = startOfDay(addDays(now, LOOKAHEAD_DAYS)).toISOString();

  const planes = usePlanes(undefined, q);
  const members = useMembers(undefined, q);
  const reservations = useReservations(from, to, undefined, q);
  const invoices = useInvoices({ startDate: from }, q);
  const ratings = useRatings(q);
  const sims = useSimulators(undefined, q);
  const rooms = useRooms(undefined, q);
  const reminders = useMaintenanceReminders(undefined, q);
  const groups = useResourceGroups(q);
  const courses = useCourses(undefined, q);
  const billing = useBilling(q);
  const quickBooks = useQuickBooksSettings(q);
  const splitRules = useSplitRules(q);

  const update = useUpdateOrgOnboarding();

  const facts: ChecklistFacts = {
    organization,
    planes: planes.data?.length ?? 0,
    reservations: reservations.data?.length ?? 0,
    invoices: invoices.data?.length ?? 0,
    members: members.data ?? [],
    ratings: ratings.data?.length ?? 0,
    facilities: (sims.data?.length ?? 0) + (rooms.data?.length ?? 0),
    reminders: reminders.data?.length ?? 0,
    groups: groups.data?.length ?? 0,
    courses: courses.data?.length ?? 0,
    stripeConnected: Boolean(billing.data?.stripeEnabled),
    quickBooksConnected: quickBooks.data?.status === "connected",
    splitRulesConfigured: (splitRules.data?.rules.length ?? 0) > 0,
  };

  const orgType = (organization?.organizationType ?? null) as OrgType;
  const source = preview.track ?? onboarding.data?.source ?? null;
  const dismissedItems = useMemo(() => onboarding.data?.dismissedItems ?? [], [onboarding.data]);

  const loading =
    onboarding.isLoading ||
    (live &&
      [planes, members, reservations, invoices, ratings, sims, rooms, reminders, groups, courses, billing].some(
        (r) => r.isLoading
      ));

  // A dozen predicates over already-fetched counts, cheaper to just run than to
  // memoize, and memoizing would mean keeping a dependency list in step with every
  // field an item reads.
  const applicable = CHECKLIST.filter((i) => i.appliesTo?.(orgType) ?? true);
  const entries: ChecklistEntry[] = orderForTrack(
    applicable.map((i) => i.id),
    source
  )
    .map((id) => applicable.find((i) => i.id === id)!)
    .map((item) => ({
      item,
      done: item.isDone(facts),
      dismissed: dismissedItems.includes(item.id),
    }));

  const counted = entries.filter((e) => !e.dismissed);
  const doneCount = counted.filter((e) => e.done).length;
  const total = counted.length;
  const percent = total === 0 ? 100 : Math.round((doneCount / total) * 100);
  const complete = !loading && total > 0 && doneCount === total;

  /**
   * Retire the checklist for good the first time it completes.
   *
   * Without this it could come back from the dead: several items are answered over a
   * rolling window, so a quiet month would flip one back to undone and re-open a card
   * the school finished with long ago. Completion is a one-way door.
   */
  const retiring = useRef(false);
  useEffect(() => {
    // Never while previewing: `?checklist=show` exists to look at a retired board,
    // and re-stamping it on sight would make the override a write.
    if (!live || !complete || retiring.current || preview.force) return;
    retiring.current = true;
    update.mutate({ dismissedAt: new Date().toISOString() });
    // `update` is a stable mutation object from react-query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, complete]);

  const setDismissed = (ids: string[]) => update.mutate({ dismissedItems: ids });

  return {
    entries,
    remaining: entries.filter((e) => !e.done && !e.dismissed),
    done: doneCount,
    total,
    percent,
    trackCaption: trackFor(source)?.caption ?? null,
    orgType,
    // Still show a completed board for the moment between finishing and the retire
    // landing, vanishing mid-click reads as a bug.
    visible: live && !retired,
    loading,
    dismissItem: (id) => setDismissed([...dismissedItems.filter((d) => d !== id), id]),
    restoreItem: (id) => setDismissed(dismissedItems.filter((d) => d !== id)),
  };
}

/**
 * Whether the org has enough real activity for reports to beat a preview.
 *
 * Same windows as the checklist so the two queries are shared by react-query rather
 * than duplicated, and same reasoning: an operation this question is being asked about
 * is by definition a young one.
 */
export function useReportsReadiness(enabled: boolean) {
  const { roles } = useAuth();
  const now = new Date();
  const from = startOfDay(addDays(now, -LOOKBACK_DAYS)).toISOString();
  const to = startOfDay(addDays(now, LOOKAHEAD_DAYS)).toISOString();
  const q = { enabled };

  const reservations = useReservations(from, to, undefined, q);
  // Reports are open to dispatchers and technicians, who cannot read invoices.
  // asking anyway would just 403 in their logs. They fall back to the reservation
  // count, which is the other half of the same OR.
  const invoices = useInvoices({ startDate: from }, { enabled: enabled && isAdmin(roles) });
  const reminders = useMaintenanceReminders(undefined, q);

  return {
    reservations: reservations.data?.length ?? 0,
    invoices: invoices.data?.length ?? 0,
    reminders: reminders.data?.length ?? 0,
    loading: reservations.isLoading || invoices.isLoading || reminders.isLoading,
  };
}

export { resolveCopy };
