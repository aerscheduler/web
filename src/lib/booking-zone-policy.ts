import type { Organization } from "@/types/api";

/** Default school flying day when policy row uses Prisma defaults (6:00–22:00). */
const DEFAULT_FLYING_START = 6 * 60;
const DEFAULT_FLYING_END = 22 * 60;

export function orgFlyingDayRestricted(
  policy: Organization["bookingPolicy"] | undefined
): boolean {
  const start = policy?.flyingDayStartMinute ?? DEFAULT_FLYING_START;
  const end = policy?.flyingDayEndMinute ?? DEFAULT_FLYING_END;
  return !(start === 0 && end === 0);
}

/** Org has any wall-clock booking rule that needs an airport/org IANA zone. */
export function orgWallClockRulesActive(organization: Organization | null | undefined): boolean {
  if (!organization) return false;
  const policy = organization.bookingPolicy;
  if ((policy?.bookingHorizonDays ?? 0) > 0) return true;
  if ((policy?.startTimeIncrementMinutes ?? 0) > 0) return true;
  if (policy?.multiDayEnabled) return true;
  return orgFlyingDayRestricted(policy);
}

export const BOOKING_ZONE_MEMBER_MESSAGE =
  "Set a time zone in Settings before members can book against operating hours or wall-clock rules. The front desk can still schedule until then.";
