import {
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  ListChecks,
  PlaneTakeoff,
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
  value: "aircraft" | "reminders" | "templates" | "compliance" | "open" | "resolved";
  label: string;
  icon: LucideIcon;
  keywords?: string[];
};

export const MAINTENANCE_SECTIONS: { label: string; items: MaintenanceView[] }[] = [
  {
    label: "Inspections",
    items: [
      {
        value: "aircraft",
        label: "By aircraft",
        icon: PlaneTakeoff,
        keywords: ["fleet status", "tail", "due", "annual"],
      },
      {
        value: "reminders",
        label: "All inspections",
        icon: ListChecks,
        keywords: ["reminders", "inspection list", "overdue", "due soon"],
      },
      {
        value: "templates",
        label: "Set up",
        icon: SlidersHorizontal,
        keywords: ["inspection templates", "rules", "intervals", "configure"],
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
