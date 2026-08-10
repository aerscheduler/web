import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format as fnsFormat, parseISO } from "date-fns";

/** Merge conditional class names, de-duping conflicting Tailwind utilities. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse an ISO date string safely, returns null instead of throwing.
 * `date-fns`' `parseISO(undefined)` throws (`.split` of undefined), which has
 * crashed whole pages when an API field like `createdAt`/`expiresAt` is missing.
 */
export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso || typeof iso !== "string") return null;
  const d = parseISO(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format an ISO date string; returns `fallback` (default "–") when missing/invalid. */
export function formatDate(
  iso: string | null | undefined,
  fmt = "MMM d, yyyy",
  fallback = "–"
): string {
  const d = parseDate(iso);
  return d ? fnsFormat(d, fmt) : fallback;
}

/** Format cents (the API stores money as integer cents) as USD. */
export function formatMoney(cents: number | null | undefined, opts?: { cents?: boolean }) {
  const n = (cents ?? 0) / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents === false ? 0 : 2,
    maximumFractionDigits: opts?.cents === false ? 0 : 2,
  });
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
