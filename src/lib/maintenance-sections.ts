import {
  ClipboardCheck,
  ClipboardList,
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
  value: "aircraft" | "reminders" | "templates" | "open" | "resolved";
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
