import {
  CalendarClock,
  Clock,
  CreditCard,
  RefreshCw,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types/api";
import { canSelfBook, isInstructor } from "@/lib/permissions";

/**
 * Profile & account tabs, shared with the command palette.
 *
 * Payment methods and Availability used to be their own routes (and still redirect here);
 * they live as `?tab=` values so the palette can land on the right pane. Availability is
 * instructor-only, matching the rule the page applies. Standby is for roles that can
 * book themselves onto a reservation.
 */
export type ProfileTab =
  | "profile"
  | "security"
  | "calendar"
  | "availability"
  | "standby"
  | "payments";

export type ProfileTabDef = {
  value: ProfileTab;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  canShow?: (roles: Role[]) => boolean;
};

export const PROFILE_TABS: ProfileTabDef[] = [
  {
    value: "profile",
    label: "Profile",
    icon: UserRound,
    keywords: ["my account", "name", "contact", "emergency contact", "time zone", "membership"],
  },
  {
    value: "security",
    label: "Security",
    icon: ShieldCheck,
    keywords: ["password", "change password", "login", "credentials"],
  },
  {
    value: "calendar",
    label: "Calendar",
    icon: CalendarClock,
    keywords: ["google calendar", "sync calendar", "external calendar"],
  },
  {
    value: "availability",
    label: "Availability",
    icon: Clock,
    keywords: ["my hours", "when i work", "unavailable", "instructor hours"],
    canShow: isInstructor,
  },
  {
    value: "standby",
    label: "Standby",
    icon: RefreshCw,
    keywords: ["offers", "standby", "waitlist", "open window", "standing preference", "claim slot"],
    canShow: canSelfBook,
  },
  {
    value: "payments",
    label: "Payment methods",
    icon: CreditCard,
    keywords: ["my card", "credit card", "ach", "bank", "stripe"],
  },
];

export const PROFILE_TAB_VALUES = PROFILE_TABS.map((t) => t.value);
