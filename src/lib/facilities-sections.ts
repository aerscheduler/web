import { DoorOpen, MapPin, MonitorPlay, type LucideIcon } from "lucide-react";
import type { RailSection } from "@/components/section-rail";

/**
 * Facilities' rail, shared with the command palette.
 *
 * Locations / simulators / classrooms share a URL and are told apart by `?tab=`. Adding
 * a section here puts it in the rail AND makes it findable.
 */
export type FacilitiesTab = {
  value: "locations" | "simulators" | "rooms";
  label: string;
  icon: LucideIcon;
  keywords?: string[];
};

export const FACILITIES_TABS: FacilitiesTab[] = [
  {
    value: "locations",
    label: "Locations",
    icon: MapPin,
    keywords: ["airport", "base", "campus", "address"],
  },
  {
    value: "simulators",
    label: "Simulators",
    icon: MonitorPlay,
    keywords: ["sim", "aft", "batd", "ftd", "training device"],
  },
  {
    value: "rooms",
    label: "Rooms",
    icon: DoorOpen,
    keywords: ["classroom", "briefing", "ground school"],
  },
];

export const FACILITIES_RAIL: RailSection[] = [{ items: FACILITIES_TABS }];
