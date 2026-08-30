import { BadgeCheck, BadgeDollarSign, Building2, CreditCard, FileCog, GraduationCap, KeyRound, Layers, Puzzle, ShieldCheck, SlidersHorizontal, Split, type LucideIcon } from "lucide-react";

/**
 * Every section of Settings, in the order the page's left rail shows them.
 *
 * Lives here rather than inside the route because Settings is not one page in any way a
 * user would recognise: it is eleven screens sharing a URL, and `?tab=` is the only thing
 * that tells them apart. The command palette needs the same list to offer them as
 * destinations, "cost splitting" and "api keys" are pages people go looking for, and
 * neither word appears anywhere else in the console.
 *
 * Adding a section here puts it in the rail AND makes it findable. Adding it only to the
 * route's render switch gets you a section nobody can search for.
 */
export type SettingsTab = {
  /** The `?tab=` value. Stable: onboarding deep links and bookmarks point at it. */
  value: string;
  label: string;
  icon: LucideIcon;
  /** Other words for this section, for the palette. See `NavItem.keywords`. */
  keywords?: string[];
  /**
   * Only shown to an Enterprise school. The server is the authority (it refuses the
   * endpoints outright), this just keeps a screen nobody can use out of the rail and
   * out of the command palette. Filter with `settingsSectionsFor`.
   */
  enterpriseOnly?: boolean;
  /**
   * Only shown to an admin or owner, whatever grants the member holds.
   *
   * Settings as a whole is reachable on the `manageOrgSettings` grant, deliberately, so
   * a school can let an office manager edit its details without making them an admin.
   * That is the right default for most of these panes and the wrong one for what
   * AerScheduler charges the school: the plan page names their rate, what we comp, and
   * how much of it. Same line the paywall draws.
   */
  adminOnly?: boolean;
};

export const SETTINGS_SECTIONS: { label: string; tabs: SettingsTab[] }[] = [
  {
    label: "School",
    tabs: [
      { value: "organization", label: "Organization", icon: Building2, keywords: ["school", "name", "logo", "address", "time zone"] },
      {
        value: "booking-preferences",
        label: "Booking preferences",
        icon: SlidersHorizontal,
        keywords: ["booking policy", "multi-day", "overnight", "payment method required", "rules", "approved resources", "checkout"],
      },
      { value: "groups", label: "Groups", icon: Layers, keywords: ["resource groups", "fleet groups"] },
      { value: "documents", label: "Document types", icon: FileCog, keywords: ["required documents", "licenses", "expiry"] },
      {
        value: "ad-tracking",
        label: "Airworthiness Directives",
        icon: ShieldCheck,
        keywords: ["AD", "ADs", "airworthiness directive", "part 39", "adlog", "avtrak", "tdata", "serial number", "catalogue"],
        //Admin-only: turning the catalogue on changes what every technician at the school is
        //asked to review, which is not an office-manager decision.
        adminOnly: true,
      },
    ],
  },
  {
    label: "Billing",
    tabs: [
      {
        value: "plan",
        label: "Plan",
        icon: BadgeDollarSign,
        keywords: ["subscription", "price", "per aircraft"],
        adminOnly: true,
      },
      { value: "billing", label: "Billing", icon: CreditCard, keywords: ["stripe", "connect", "payouts", "fees", "ledger", "invoice"] },
      {
        value: "memberships",
        label: "Memberships",
        icon: BadgeCheck,
        keywords: ["dues", "club", "membership", "join fee", "initiation", "monthly dues", "recurring"],
      },
      { value: "rates", label: "Instruction rates", icon: GraduationCap, keywords: ["hourly rate", "instructor rate", "ratings", "pricing"] },
      {
        value: "cost-splitting",
        label: "Cost splitting",
        icon: Split,
        keywords: ["split billing", "who pays", "shared flight", "apportionment"],
      },
      { value: "currencies", label: "Currency rules", icon: ShieldCheck, keywords: ["medical", "bfr", "checkout", "expiry rules"] },
    ],
  },
  {
    label: "Connections",
    tabs: [
      { value: "integrations", label: "Integrations", icon: Puzzle, keywords: ["quickbooks", "google calendar", "sync"] },
      {
        value: "api-keys",
        label: "API keys",
        icon: KeyRound,
        keywords: ["api", "token", "credential", "zapier", "developer", "enterprise"],
        enterpriseOnly: true,
      },
    ],
  },
];

/**
 * The sections this member actually gets, with empty groups dropped.
 *
 * Anything reading SETTINGS_SECTIONS directly shows Enterprise-only and admin-only
 * screens to everyone, so the rail and the command palette both come through here.
 * The route renders through the same filter, so `?tab=plan` typed by hand is not a way
 * in either.
 */
export const settingsSectionsFor = (enterprise: boolean, admin = true) =>
  SETTINGS_SECTIONS.map((section) => ({
    ...section,
    tabs: section.tabs.filter(
      (tab) => (enterprise || !tab.enterpriseOnly) && (admin || !tab.adminOnly)
    ),
  })).filter((section) => section.tabs.length > 0);

/** Whether this member may open one section, by `?tab=` value. */
export const canSeeSettingsTab = (tab: string, enterprise: boolean, admin: boolean): boolean =>
  settingsSectionsFor(enterprise, admin).some((s) => s.tabs.some((t) => t.value === tab));

export const SETTINGS_TABS: SettingsTab[] = SETTINGS_SECTIONS.flatMap((s) => s.tabs);

/** The section `?tab=` names, or the default when it names nothing we have. */
export const settingsTabOrDefault = (tab: string | undefined): string =>
  tab && SETTINGS_TABS.some((t) => t.value === tab) ? tab : "organization";
