import { CalendarDays, RefreshCw, type LucideIcon } from "lucide-react";
import type { RailSection } from "@/components/section-rail";

/**
 * Tabs on /me/schedule. Shared with the command palette so "offers" /
 * standby land on the right pane without a separate You-nav item.
 *
 * Layout uses SectionRail (same shell as Settings / My training), told apart
 * by `?tab=`.
 */
export type MeScheduleTab = "schedule" | "offers";

export type MeScheduleTabDef = {
  value: MeScheduleTab;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
};

export const ME_SCHEDULE_TABS: MeScheduleTabDef[] = [
  {
    value: "schedule",
    label: "Schedule",
    icon: CalendarDays,
    keywords: ["my flights", "my bookings", "calendar"],
  },
  {
    value: "offers",
    label: "Offers",
    icon: RefreshCw,
    keywords: ["offers", "standby", "waitlist", "open slot", "claim"],
  },
];

export const ME_SCHEDULE_TAB_VALUES = ME_SCHEDULE_TABS.map((t) => t.value);

export const ME_SCHEDULE_RAIL: RailSection[] = [{ items: ME_SCHEDULE_TABS }];
