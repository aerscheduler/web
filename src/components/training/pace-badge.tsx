import { Activity, AlertTriangle, CircleCheck, PauseCircle } from "lucide-react";
import type { Pace } from "@/types/api";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const LOOK = {
  onTrack: { label: "On track", variant: "secondary" as const, Icon: CircleCheck },
  atRisk: { label: "At risk", variant: "warning" as const, Icon: AlertTriangle },
  behind: { label: "Behind", variant: "warning" as const, Icon: Activity },
  stalled: { label: "Stalled", variant: "danger" as const, Icon: PauseCircle },
};

/**
 * How a student is keeping up.
 *
 * Advisory, and the tooltip says why rather than leaving a red word on somebody's record
 * with no explanation. "Stalled" next to a name is a thing an instructor will be asked
 * about, and the answer should be on screen.
 *
 * Renders nothing when there is nothing to say: a brand-new student is not "on track", they
 * are simply new, and labelling that is noise.
 */
export function PaceBadge({ pace }: { pace: Pace | undefined }) {
  if (!pace || pace.status === "unknown") return null;
  const look = LOOK[pace.status];
  if (!look) return null;

  const badge = (
    <Badge variant={look.variant} className="gap-1">
      <look.Icon className="size-3" /> {look.label}
    </Badge>
  );

  return pace.reason ? (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{pace.reason}</TooltipContent>
    </Tooltip>
  ) : (
    badge
  );
}
