import { CalendarClock, LayoutDashboard, type LucideIcon } from "lucide-react";

/**
 * The fixed panes on Reports that are not catalog entries.
 *
 * Individual reports come from the server's catalog (role-filtered) and grow without this
 * file changing. The palette only needs the two panes people name by job ("overview",
 * "scheduled reports"), which share `/reports` and are told apart by `?report=`.
 */
export type ReportsFixedPane = {
  value: "overview" | "scheduled";
  label: string;
  icon: LucideIcon;
  keywords?: string[];
};

export const REPORTS_FIXED_PANES: ReportsFixedPane[] = [
  {
    value: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    keywords: ["reports dashboard", "summary", "tiles"],
  },
  {
    value: "scheduled",
    label: "Scheduled reports",
    icon: CalendarClock,
    keywords: ["email reports", "recurring", "report schedule", "send report"],
  },
];

/** `?report=` values that are panes, not catalog report ids. */
export const REPORTS_OVERVIEW = "overview" as const;
export const REPORTS_SCHEDULED = "scheduled" as const;
