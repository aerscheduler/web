import type { Plane } from "@/types/api";

/** Status chip descriptor for a plane — grounded > in-flight > available. */
export function planeStatus(p: Plane): {
  label: string;
  variant: "success" | "warning" | "danger";
} {
  if (p.grounded) return { label: "Grounded", variant: "danger" };
  if (p.rampedIn) return { label: "In flight", variant: "warning" };
  return { label: "Available", variant: "success" };
}

/** The billable rate to surface — prefer wet, then dry — with its per-unit note. */
export function planeRate(
  p: Plane
): { cents: number; basis: "wet" | "dry"; per: "/Hobbs" | "/tach" } | null {
  const c = p.cost;
  if (!c) return null;
  const per: "/Hobbs" | "/tach" = c.billByHobbsTime ? "/Hobbs" : "/tach";
  if (c.wetRate != null) return { cents: c.wetRate, basis: "wet", per };
  if (c.dryRate != null) return { cents: c.dryRate, basis: "dry", per };
  return null;
}

/** Human title for a plane, e.g. "2004 Cessna 172". */
export function planeTitle(p: Plane): string {
  return [p.year, p.make, p.model].filter(Boolean).join(" ") || "Aircraft";
}

export type PlaneTemplate = {
  value: string;
  label: string;
  make: string;
  model: string;
  categoryClass: string;
  /** Suggested wet rate in integer cents. */
  wetRate: number;
  /** Typical usable fuel, gallons. */
  fuelCapacity: number;
};

/** Quick-start templates that prefill make/model/category + rate + fuel presets. */
export const PLANE_TEMPLATES: PlaneTemplate[] = [
  { value: "C172", label: "Cessna 172", make: "Cessna", model: "172", categoryClass: "single-engine land", wetRate: 16500, fuelCapacity: 56 },
  { value: "C152", label: "Cessna 152", make: "Cessna", model: "152", categoryClass: "single-engine land", wetRate: 12500, fuelCapacity: 26 },
  { value: "PA-28", label: "Piper PA-28", make: "Piper", model: "PA-28", categoryClass: "single-engine land", wetRate: 15500, fuelCapacity: 50 },
  { value: "DA40", label: "Diamond DA40", make: "Diamond", model: "DA40", categoryClass: "single-engine land", wetRate: 19500, fuelCapacity: 40 },
  { value: "SR20", label: "Cirrus SR20", make: "Cirrus", model: "SR20", categoryClass: "single-engine land", wetRate: 22500, fuelCapacity: 56 },
  { value: "OTHER", label: "Other / custom", make: "", model: "", categoryClass: "", wetRate: 0, fuelCapacity: 50 },
];
