/**
 * The setup checklist, what a new operation still has to do, expressed as outcomes.
 *
 * Two rules hold this together.
 *
 * **Completion is derived, never stored.** Every item answers "am I done?" from the
 * org's real data, a plane exists, Connect is on, a reminder is set. Nothing writes
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
  Hammer,
  Percent,
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
export type OrgType =
  | "flight_school"
  | "flying_club"
  | "rental"
  | "solo_instructor"
  | "aircraft_owner"
  | "maintenance_shop"
  | null;

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
  /** Published training courses (curriculum). */
  courses: number;
  stripeConnected: boolean;
  quickBooksConnected: boolean;
  /**
   * Has this operation decided how a shared booking's cost divides?
   *
   * Derived from whether any split rules EXIST, not from a stored "did the step" flag.
   * same rule as every other item here. An org that has never opened the screen bills one
   * person for the whole booking, which is the safe default and also what it always did.
   */
  splitRulesConfigured: boolean;

  // The maintenance shop's facts. A shop's ladder is a customer's aircraft, then a job on
  // it, then the bill for the job, so these are what its items are answered from.
  /** Customers' aircraft on file (`use = shop`). `planes` counts only the fleet. */
  shopPlanes: number;
  /** Work orders, open or finished. */
  workOrders: number;
  /** Work orders that have raised a bill (invoiced or paid). */
  billedWorkOrders: number;
  /** The shop has set a labor rate (Settings, Shop rates). */
  shopRatesSet: boolean;
};

/**
 * What else decides whether an item applies, besides the org type.
 *
 * A flight school with its own hangar (Murray) is not a shop org, but one that told us it
 * wants the shop working (the "shop" source) should see the shop items too.
 */
export type ApplyContext = { source: string | null };

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
  /** Items that make no sense for some operations, a solo CFI has no instructors
   *  to invite, are absent rather than permanently unchecked. */
  appliesTo?: (orgType: OrgType, ctx: ApplyContext) => boolean;
};

export const resolveCopy = (copy: Copy, orgType: OrgType): string =>
  typeof copy === "function" ? copy(orgType) : copy;

const isClubLike = (t: OrgType) => t === "flying_club" || t === "rental";
/** An A&P or repair station. Nothing here flies, so the flight items do not apply. */
export const isShopOrg = (t: OrgType) => t === "maintenance_shop";
const runsShop = (t: OrgType, ctx: ApplyContext) => isShopOrg(t) || ctx.source === "shop";
const isPrivateOwner = (t: OrgType) => t === "aircraft_owner";
const isSoloish = (t: OrgType) => t === "solo_instructor" || isPrivateOwner(t);

/** Members holding a role, ignoring the founder (always the owner), who would
 *  otherwise mark "invite your instructors" done on day one. */
function othersWithRole(
  members: OrganizationUser[],
  role: "instructor" | "student" | "renter" | "technician"
): number {
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
    // A shop's aircraft are its customers', which is the customer-aircraft item.
    appliesTo: (t) => !isShopOrg(t),
  },
  {
    id: "customer-aircraft",
    title: "Add a customer's aircraft",
    blurb: "The tail, its meters and its owner. The owner is who the work is billed to.",
    icon: PlaneTakeoff,
    to: "/aircraft",
    search: { scope: "shop" },
    cta: "Add an aircraft",
    isDone: (f) => f.shopPlanes > 0,
    appliesTo: runsShop,
  },
  {
    id: "work-order",
    title: "Open your first work order",
    blurb: "What the owner asked for, what you found, your labor and parts, and the invoice, on one job.",
    icon: Hammer,
    to: "/maintenance",
    search: { view: "work-orders" },
    cta: "Open a work order",
    isDone: (f) => f.workOrders > 0,
    appliesTo: runsShop,
  },
  {
    id: "shop-rates",
    title: "Set your shop rates",
    blurb: "Your labor rate fills in every labor line, and your markup prices parts and outside work.",
    icon: Percent,
    to: "/settings",
    search: { tab: "shop-rates" },
    cta: "Set rates",
    isDone: (f) => f.shopRatesSet,
    appliesTo: runsShop,
  },
  {
    id: "reservation",
    title: "Put your first flight on the schedule",
    blurb: "Book a real lesson or rental. The board, close-out and invoice all follow from it.",
    icon: PlaneTakeoff,
    to: "/schedule",
    cta: "Open the calendar",
    isDone: (f) => f.reservations > 0,
    appliesTo: (t) => !isShopOrg(t),
  },
  {
    id: "billing",
    title: "Connect billing",
    blurb: (t) =>
      isShopOrg(t)
        ? "Owners pay a job's invoice by card or ACH from the email Stripe sends them. Payouts land in your own bank; QuickBooks sync is optional."
        : "Stripe lets you charge cards and ACH. Bill with invoices per booking, or use an account ledger. Payouts land in your own bank; QuickBooks sync is optional.",
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
    appliesTo: (t) => !isPrivateOwner(t) && !isShopOrg(t),
    //Placed after billing on purpose: the rules decide how invoices divide, so it reads
    //oddly before there is any way to send one. It is NOT gated on Stripe though, a
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
    appliesTo: (t) => !isSoloish(t) && !isShopOrg(t),
  },
  {
    id: "technicians",
    title: "Invite your technicians",
    blurb: "Only technicians can be put on a job. They log their own hours and parts, and see no member billing.",
    icon: Users,
    to: "/people",
    cta: "Invite technicians",
    isDone: (f) => othersWithRole(f.members, "technician") > 0,
    appliesTo: runsShop,
  },
  {
    id: "students",
    title: (t) =>
      isPrivateOwner(t)
        ? "Invite people who fly with you"
        : isClubLike(t)
          ? "Invite your members"
          : "Invite your students",
    blurb: (t) =>
      isPrivateOwner(t)
        ? "A partner or another renter books against the same tail, within the rules you set."
        : isClubLike(t)
          ? "Members book themselves within the rules you set, and pay their own invoices."
          : "Students book within your rules, see their currency, and pay their own invoices.",
    icon: Users,
    to: "/people",
    cta: (t) =>
      isPrivateOwner(t) ? "Invite someone" : isClubLike(t) ? "Invite members" : "Invite students",
    isDone: (f) => othersWithRole(f.members, "student") + othersWithRole(f.members, "renter") > 0,
    appliesTo: (t) => !isShopOrg(t),
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
    appliesTo: (t) => !isPrivateOwner(t) && !isShopOrg(t),
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
    appliesTo: (t) => !isShopOrg(t),
  },
  {
    id: "maintenance",
    title: (t) => (isShopOrg(t) ? "Track inspections on customer aircraft" : "Track maintenance due dates"),
    blurb: (t) =>
      isShopOrg(t)
        ? "Annuals and 100-hours counting down on each customer's aircraft, so you call the owner before they are due."
        : "Annuals, 100-hours and transponder checks warn you before they ground an aircraft.",
    icon: Wrench,
    to: "/maintenance",
    cta: "Add reminders",
    isDone: (f) => f.reminders > 0,
  },
  {
    id: "training",
    title: "Add a training course",
    blurb: "A syllabus your instructors grade against, and enrollments your students can see.",
    icon: GraduationCap,
    to: "/training",
    cta: "Open training",
    isDone: (f) => f.courses > 0,
    appliesTo: (t) => !isSoloish(t) && t !== "rental" && !isShopOrg(t),
  },
  {
    id: "facilities",
    title: "Add simulators and classrooms",
    blurb: "Bookable on the same board as your aircraft, and they don't count toward your plan.",
    icon: MonitorPlay,
    to: "/facilities",
    cta: "Add facilities",
    isDone: (f) => f.facilities > 0,
    appliesTo: (t) => !isSoloish(t) && !isShopOrg(t),
  },
  {
    id: "invoice",
    title: "Send your first invoice",
    blurb: "Close out a flight and the invoice drafts itself from Hobbs or tach. Review it and send.",
    icon: Receipt,
    to: "/billing",
    cta: "Open billing",
    isDone: (f) => f.invoices > 0,
    // A shop's first invoice is raised from a job, which is the job-invoice item.
    appliesTo: (t) => !isShopOrg(t),
  },
  {
    id: "job-invoice",
    title: "Raise the invoice for a job",
    blurb: "Raise invoice on a work order bills its labor and parts to the owner, with the WO number and meters on it.",
    icon: Receipt,
    to: "/maintenance",
    search: { view: "work-orders" },
    cta: "Open jobs",
    isDone: (f) => f.billedWorkOrders > 0,
    appliesTo: runsShop,
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
    appliesTo: (t) => !isSoloish(t) && !isShopOrg(t),
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
