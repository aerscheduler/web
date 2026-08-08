import { BookOpen, GraduationCap, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Role } from "@/types/api";
import { isAdmin } from "@/lib/permissions";

/**
 * Training's rail sections, shared with the command palette.
 *
 * Three jobs on one URL (`?tab=`): writing syllabi, running students, and handing out
 * grants. Permissions is admin-only. Courses can also disappear at runtime when the
 * courses call 403s (no `configureTraining` grant): the route handles that, and the
 * palette still offers Courses to anyone who can open /training (the page falls back
 * if they cannot see that section).
 */
export type TrainingTab = {
  value: "courses" | "students" | "permissions";
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  /** When set, the rail and palette only offer this tab if it returns true. */
  canShow?: (roles: Role[]) => boolean;
};

export const TRAINING_TABS: TrainingTab[] = [
  {
    value: "courses",
    label: "Courses",
    icon: BookOpen,
    keywords: ["syllabus", "curriculum", "part 141", "part 61", "course library"],
  },
  {
    value: "students",
    label: "Students",
    icon: GraduationCap,
    keywords: ["enrollments", "roster", "in training", "progress"],
  },
  {
    value: "permissions",
    label: "Permissions",
    icon: ShieldCheck,
    keywords: ["grants", "configure training", "who can teach", "training access"],
    canShow: isAdmin,
  },
];
