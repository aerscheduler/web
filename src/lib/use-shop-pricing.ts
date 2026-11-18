import { useAuth } from "@/lib/auth";
import { canPriceShopWork } from "@/lib/permissions";

/**
 * Whether the signed-in member may price shop work: an admin, or anybody given "Shop pricing"
 * (`priceShopWork`, a lead technician). Same answer as the server's `mayPriceShopWork`.
 */
export function useCanPriceShopWork(): boolean {
  const { roles, permissions } = useAuth();
  return canPriceShopWork(roles, permissions?.granted ? new Set<string>(permissions.granted) : null);
}
