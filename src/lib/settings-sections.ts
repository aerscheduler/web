import {
  BadgeDollarSign,
  Building2,
  CreditCard,
  KeyRound,
  FileCog,
  GraduationCap,
  Layers,
  Puzzle,
  ShieldCheck,
  SlidersHorizontal,
  Split,
  type LucideIcon,
} from "lucide-react";

/**
 * Every section of Settings, in the order the page's left rail shows them.
 *
 * Lives here rather than inside the route because Settings is not one page in any way a
 * user would recognise: it is eleven screens sharing a URL, and `?tab=` is the only thing
 * that tells them apart. The command palette needs the same list to offer them as
 * destinations — "cost splitting" and "api keys" are pages people go looking for, and
 * neither word appears anywhere else in the console.
 *
 * Adding a section here puts it in the rail AND makes it findable. Adding it only to the
 * route's render switch gets you a section nobody can search for.
 */
export type SettingsTab = {
  /** The `?tab=` value. Stable — onboarding deep links and bookmarks point at it. */
  value: string;
  label: string;
  icon: LucideIcon;
  /** Other words for this section, for the palette. See `NavItem.keywords`. */
  keywords?: string[];
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
        keywords: ["booking policy", "multi-day", "overnight", "payment method required", "rules"],
      },
      { value: "groups", label: "Groups", icon: Layers, keywords: ["resource groups", "fleet groups"] },
      { value: "documents", label: "Document types", icon: FileCog, keywords: ["required documents", "licenses", "expiry"] },
    ],
  },
  {
    label: "Billing",
    tabs: [
      { value: "plan", label: "Plan", icon: BadgeDollarSign, keywords: ["subscription", "price", "per aircraft"] },
      { value: "billing", label: "Billing", icon: CreditCard, keywords: ["stripe", "connect", "payouts", "fees"] },
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
      { value: "api-keys", label: "API keys", icon: KeyRound, keywords: ["api", "token", "credential", "zapier", "developer"] },
    ],
  },
];

export const SETTINGS_TABS: SettingsTab[] = SETTINGS_SECTIONS.flatMap((s) => s.tabs);

/** The section `?tab=` names, or the default when it names nothing we have. */
export const settingsTabOrDefault = (tab: string | undefined): string =>
  tab && SETTINGS_TABS.some((t) => t.value === tab) ? tab : "organization";
