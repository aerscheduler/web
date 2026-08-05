/**
 * The setup checklist — what a new operation still has to do, expressed as outcomes.
 *
 * Two rules hold this together.
 *
 * **Completion is derived, never stored.** Every item answers "am I done?" from the
 * org's real data — a plane exists, Connect is on, a reminder is set. Nothing writes
 * a "did the aircraft step" flag, so the list cannot drift from the truth, is right
 * for every admin who looks at it, and stays right when someone adds their first
 * aircraft from the Aircraft page instead of from here. The only thing the server
 * stores is what the org waved off (see `GET /organizations/onboarding`).
 *
 * **One registry, every surface.** The onboarding wizard's last screen and the
 * dashboard card render this same list through the same component. Adding an item is
 * an entry here and nothing else.
 */

import {
  Building2,
  Split,
  CreditCard,
  GraduationCap,
  Layers,
  MonitorPlay,
  PlaneTakeoff,
  Puzzle,
  Receipt,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { Organization, OrganizationUser } from "@/types/api";
import { rolesOf } from "@/types/api";

/** The org shapes the wizard can create. Anything else is treated as a school. */
export type OrgType = "flight_school" | "flying_club" | "rental" | "solo_instructor" | null;

/** Everything the items need to decide whether they're done. Gathered once, by
 *  `useChecklist`, so an item can never fire a request of its own. */
export type ChecklistFacts = {
  organization: Organization | null;
  planes: number;
  reservations: number;
  invoices: number;
  members: OrganizationUser[];
  ratings: number;
  facilities: number;
  reminders: number;
  groups: number;
  stripeConnected: boolean;
  quickBooksConnected: boolean;
  /**
   * Has this operation decided how a shared booking's cost divides?
   *
   * Derived from whether any split rules EXIST, not from a stored "did the step" flag —
   * same rule as every other item here. An org that has never opened the screen bills one
   * person for the whole booking, which is the safe default and also what it always did.
   */
  splitRulesConfigured: boolean;
};

type Copy = string | ((orgType: OrgType) => string);

export type ChecklistItem = {
  id: string;
  title: Copy;
  blurb: Copy;
  icon: LucideIcon;
  /** Where the item's CTA goes. Plain route path; `search` carries any tab. */
  to: string;
  search?: Record<string, string>;
  cta: Copy;
  isDone: (f: ChecklistFacts) => boolean;
  /** Items that make no sense for some operations — a solo CFI has no instructors
   *  to invite — are absent rather than permanently unchecked. */
  appliesTo?: (orgType: OrgType) => boolean;
};

export const resolveCopy = (copy: Copy, orgType: OrgType): string =>
  typeof copy === "function" ? copy(orgType) : copy;

const isClubLike = (t: OrgType) => t === "flying_club" || t === "rental";

/** Members holding a role, ignoring the founder — who is created holding every role
 *  and would otherwise mark "invite your instructors" done on day one. */
function othersWithRole(members: OrganizationUser[], role: "instructor" | "student" | "renter"): number {
  return members.filter((m) => !m.ownerRole && rolesOf(m).includes(role)).length;
}

/**
 * The catalogue, in the order a school that came to us cold should work through it.
 * A marketing source reorders it (see `onboarding-tracks.ts`); it never changes it.
 */
export const CHECKLIST: ChecklistItem[] = [
  {
    id: "aircraft",
    title: "Add your first aircraft",
    blurb: "Nothing is bookable until a tail exists. This is the one that unlocks the rest.",
    icon: PlaneTakeoff,
    to: "/aircraft",
    cta: "Add aircraft",
    isDone: (f) => f.planes > 0,
  },
  {
    id: "reservation",
    title: "Put your first flight on the schedule",
    blurb: "Book a real lesson or rental. The board, close-out and invoice all follow from it.",
    icon: PlaneTakeoff,
    to: "/schedule",
    cta: "Open the calendar",
    isDone: (f) => f.reservations > 0,
  },
  {
    id: "billing",
    title: "Connect billing",
    blurb:
      "Stripe lets you charge cards and ACH, invoice members, and sync to QuickBooks. Payouts land in your own account.",
    icon: CreditCard,
    to: "/settings",
    search: { tab: "billing" },
    cta: "Connect Stripe",
    isDone: (f) => f.stripeConnected,
  },
  {
    id: "cost-splitting",
    title: "Decide how shared bookings are split",
    blurb: (t) =>
      isClubLike(t)
        ? "When two members share an aircraft, who pays what? Pick your defaults once and every shared booking follows them."
        : "Group ground school, two students in one aircraft, co-renters on a cross-country: each person gets their own invoice, split by rules you set.",
    icon: Split,
    to: "/settings",
    search: { tab: "cost-splitting" },
    cta: "Set your rules",
    isDone: (f) => f.splitRulesConfigured,
    //Placed after billing on purpose: the rules decide how invoices divide, so it reads
    //oddly before there is any way to send one. It is NOT gated on Stripe though — a
    //school can set its rules before connecting, and the wizard shouldn't hide the item
    //just because the money isn't wired up yet.
  },
  {
    id: "instructors",
    title: "Invite your instructors",
    blurb: "They get their own schedule, their students, and close-out from the ramp.",
    icon: Users,
    to: "/people",
    cta: "Invite instructors",
    isDone: (f) => othersWithRole(f.members, "instructor") > 0,
    // A solo CFI is the instructor. Nothing to invite.
    appliesTo: (t) => t !== "solo_instructor",
  },
  {
    id: "students",
    title: (t) => (isClubLike(t) ? "Invite your members" : "Invite your students"),
    blurb: (t) =>
      isClubLike(t)
        ? "Members book themselves within the rules you set, and pay their own invoices."
        : "Students book within your rules, see their currency, and pay their own invoices.",
    icon: Users,
    to: "/people",
    cta: (t) => (isClubLike(t) ? "Invite members" : "Invite students"),
    isDone: (f) => othersWithRole(f.members, "student") + othersWithRole(f.members, "renter") > 0,
  },
  {
    id: "rates",
    title: "Set your instruction rates",
    blurb: "A lesson can't be priced until an instruction type has a rate against it.",
    icon: GraduationCap,
    to: "/settings",
    search: { tab: "rates" },
    cta: "Set rates",
    isDone: (f) => f.ratings > 0,
  },
  {
    id: "rules",
    title: "Set your booking rules",
    blurb:
      "Who may book what, whether renters need a card on file, and whether students fly only with their own instructor.",
    icon: ShieldCheck,
    to: "/settings",
    search: { tab: "booking-preferences" },
    cta: "Review rules",
    // There's no "visited this page" flag to read, and inventing one would be a lie
    // the moment someone changed a setting elsewhere. A gate flipped on elsewhere
    // still marks this done; finishing the RulesFlow dismisses it even when every
    // switch stays off (defaults are a valid answer).
    isDone: (f) =>
      Boolean(
        f.organization?.preferences?.private ||
          f.organization?.preferences?.personnelCanOnlyUseApprovedResources ||
          f.organization?.bookingPolicy?.requirePaymentMethod
      ),
  },
  {
    id: "maintenance",
    title: "Track maintenance due dates",
    blurb: "Annuals, 100-hours and transponder checks warn you before they ground an aircraft.",
    icon: Wrench,
    to: "/maintenance",
    cta: "Add reminders",
    isDone: (f) => f.reminders > 0,
  },
  {
    id: "facilities",
    title: "Add simulators and classrooms",
    blurb: "Bookable on the same board as your aircraft, and they don't count toward your plan.",
    icon: MonitorPlay,
    to: "/facilities",
    cta: "Add facilities",
    isDone: (f) => f.facilities > 0,
    appliesTo: (t) => t !== "solo_instructor",
  },
  {
    id: "invoice",
    title: "Send your first invoice",
    blurb: "Close out a flight and the invoice drafts itself from Hobbs or tach. Review it and send.",
    icon: Receipt,
    to: "/billing",
    cta: "Open billing",
    isDone: (f) => f.invoices > 0,
  },
  {
    id: "quickbooks",
    title: "Sync invoices to QuickBooks",
    blurb: "Every invoice you send lands in QuickBooks, so your books close without re-keying.",
    icon: Puzzle,
    to: "/settings/integrations/quickbooks",
    cta: "Connect QuickBooks",
    isDone: (f) => f.quickBooksConnected,
  },
  {
    id: "groups",
    title: "Group your aircraft",
    blurb:
      "Trainers, complex, IFR-capable. Scope currency requirements to a class of aircraft, and filter reports by fleet.",
    icon: Layers,
    to: "/settings",
    search: { tab: "groups" },
    cta: "Create groups",
    isDone: (f) => f.groups > 0,
    appliesTo: (t) => t !== "solo_instructor",
  },
  {
    id: "profile",
    title: "Make it look like your operation",
    blurb: "Your logo and contact details go on invoices, emails and the join page.",
    icon: Building2,
    to: "/settings",
    search: { tab: "organization" },
    cta: "Customize",
    isDone: (f) => Boolean(f.organization?.profileImage || f.organization?.details?.phone),
  },
];

const byId = new Map(CHECKLIST.map((i) => [i.id, i]));

export const checklistItem = (id: string): ChecklistItem | undefined => byId.get(id);
