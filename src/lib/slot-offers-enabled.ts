import type { Organization } from "@/types/api";

/** School setting (default on). Matches server `OrganizationSlotOfferSettings.enabled`. */
export function orgSlotOffersEnabled(organization?: Organization | null): boolean {
  return organization?.slotOfferSettings?.enabled !== false;
}
