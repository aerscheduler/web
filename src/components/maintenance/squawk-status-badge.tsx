import type { Squawk } from "@/types/api";
import { Badge } from "@/components/ui/badge";

/**
 * Where a squawk stands, worst first.
 *
 * Deliberately NOT used by `SquawkCard`, which shows only a Grounding badge: the card is a
 * compact row on a phone and the other three states are already legible from the columns
 * around it. This is for the surfaces that need the whole answer in one chip.
 */
export function SquawkStatusBadge({ squawk }: { squawk: Squawk }) {
  if (squawk.resolvedAt) return <Badge variant="success">Resolved</Badge>;
  if (squawk.verifiedAt) return <Badge>Verified</Badge>;
  if (squawk.grounding) return <Badge variant="danger">Grounding</Badge>;
  return <Badge variant="warning">Open</Badge>;
}
