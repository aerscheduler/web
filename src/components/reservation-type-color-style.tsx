import { useAuth } from "@/lib/auth";
import { useReservationTypeColors } from "@/features/queries";
import { typeColorsCss } from "@/lib/reservation-type-colors";

/**
 * Applies the organization's own reservation type colors to the whole console by
 * overriding the `--res-*` variables. Renders nothing when the organization uses the
 * defaults. See lib/reservation-type-colors.ts.
 */
export function ReservationTypeColorStyle() {
  const { organization } = useAuth();
  //The live answer once it is in; the signed-in session's copy until then, so the first
  //paint is already in the organization's colors.
  const live = useReservationTypeColors({ enabled: !!organization });
  const colors = live.data !== undefined ? live.data : organization?.reservationTypeColors;
  const css = typeColorsCss(colors);
  if (!css) return null;
  return <style data-reservation-type-colors>{css}</style>;
}
