import { GraduationCap, ScrollText, type LucideIcon } from "lucide-react";
import type { RailSection } from "@/components/section-rail";

/**
 * My training's rail, shared with the command palette.
 *
 * Progress vs endorsements share `/me/training` and are told apart by `?tab=`. Endorsements
 * are their own destination because people look for "solo endorsement" the morning of a
 * flight, not for the page name.
 */
export type MyTrainingTab = {
  value: "progress" | "endorsements";
  label: string;
  icon: LucideIcon;
  keywords?: string[];
};

export const MY_TRAINING_TABS: MyTrainingTab[] = [
  {
    value: "progress",
    label: "Progress",
    icon: GraduationCap,
    keywords: ["my course", "my lessons", "hours", "syllabus progress"],
  },
  {
    value: "endorsements",
    label: "Endorsements",
    icon: ScrollText,
    keywords: ["solo", "90 day", "sign-off", "my endorsements", "expiry"],
  },
];

export const MY_TRAINING_RAIL: RailSection[] = [{ items: MY_TRAINING_TABS }];
