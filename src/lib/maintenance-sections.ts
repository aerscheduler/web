import {
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  Hammer,
  Archive,
  ListChecks,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { RailSection } from "@/components/section-rail";

/**
 * Maintenance's rail, shared with the command palette.
 *
 * `?view=` is the search key (not `?tab=`): the palette and squawk deep-links already
 * use it. Adding a view here puts it in the rail AND makes it findable.
 */
export type MaintenanceView = {
  value: "aircraft" | "reminders" | "templates" | "compliance" | "open" | "resolved" | "work-orders" | "work-orders-closed";
  label: string;
  icon: LucideIcon;
  keywords?: string[];
};

export const MAINTENANCE_SECTIONS: { label: string; items: MaintenanceView[] }[] = [
  // First: a shop lives in its jobs. Hidden from anyone who may not open work orders.
  {
    label: "Work orders",
    items: [
      {
        value: "work-orders",
        label: "Open jobs",
        icon: Hammer,
        //What a shop calls it, and what a desk searching for it types.
        keywords: ["work orders", "jobs", "job board", "shop", "WO", "customer aircraft"],
      },
      {
        value: "work-orders-closed",
        label: "Finished jobs",
        icon: Archive,
        keywords: ["closed work orders", "completed jobs", "job history"],
      },
    ],
  },
  {
    label: "Inspections",
    items: [
      {
        // One view since 2026-10-01, grouped by aircraft, status or inspection. The value stays
        // "aircraft" so old links keep landing here; `view=reminders` (All inspections) opens it
        // grouped by status (see routes/_authed/maintenance.tsx).
        value: "aircraft",
        label: "Inspections",
        icon: ListChecks,
        keywords: ["by aircraft", "all inspections", "fleet status", "tail", "due", "annual", "reminders", "overdue", "due soon"],
      },
      {
        // Was "Set up", which said nothing about what is on it (Tony, 2026-10-01).
        value: "templates",
        label: "Inspection rules",
        icon: SlidersHorizontal,
        keywords: ["set up", "inspection templates", "rules", "intervals", "configure"],
      },
      {
        value: "compliance",
        label: "Compliance log",
        icon: FileCheck2,
        //"airworthiness" and "AD" here on purpose: a mechanic looking for this will type
        //what the regulation is called, not what we named the screen.
        keywords: [
          "compliance records",
          "airworthiness directive",
          "AD",
          "91.417",
          "signed off",
          "logbook",
          "history",
        ],
      },
    ],
  },
  {
    label: "Squawks",
    items: [
      {
        value: "open",
        label: "Open",
        icon: ClipboardList,
        keywords: ["open squawks", "defects", "grounded", "unresolved"],
      },
      {
        value: "resolved",
        label: "Resolved",
        icon: ClipboardCheck,
        keywords: ["closed squawks", "fixed", "history"],
      },
    ],
  },
];

export const MAINTENANCE_RAIL: RailSection[] = MAINTENANCE_SECTIONS.map((section) => ({
  label: section.label,
  items: section.items,
}));

export const MAINTENANCE_VIEWS = MAINTENANCE_SECTIONS.flatMap((s) => s.items);

/** The work order views, shown only to somebody who may open work orders (canOpenWorkOrders). */
export const WORK_ORDER_VIEWS: readonly string[] = ["work-orders", "work-orders-closed"];

/** The rail without the work order section, for a dispatcher. */
export const maintenanceRailFor = (workOrders: boolean): RailSection[] =>
  workOrders ? MAINTENANCE_RAIL : MAINTENANCE_RAIL.filter((s) => !s.items.some((i) => WORK_ORDER_VIEWS.includes(i.value)));
