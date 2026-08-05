import { Moon } from "lucide-react";
import { resourceLabel, type Resource } from "@/types/api";
import { overnightDisclosure } from "@/lib/overnight-minimum";

/**
 * Warns that keeping the aircraft overnight has a floor.
 *
 * Lives in its own file because it is needed at BOTH ends of the booking's life: on the
 * create form, where the person is agreeing to the price, and through the close-out, where
 * they are about to find out what it came to. It started inside reservation-form.tsx, and
 * importing that module (the whole booking form) into the close-out section to reach one
 * notice would have been the wrong dependency.
 *
 * Renders nothing for a same-day booking or a school with no minimum, so callers can mount it
 * unconditionally. Informational rather than alarming on purpose: this is not a problem with
 * the booking, it is a price the person is about to agree to, and styling it like a grounded
 * aeroplane would teach people to dismiss it.
 */
export function OvernightMinimumNotice({
  start,
  end,
  timeZone,
  resource,
  orgMinimumTenths,
}: {
  start: Date | null;
  end: Date | null;
  timeZone: string;
  resource: Resource | undefined;
  orgMinimumTenths?: number | null;
}) {
  const disclosure = overnightDisclosure({
    start,
    end,
    timeZone,
    aircraftMinimumTenths: resource?.type?.plane?.cost?.overnightMinimumTenths ?? null,
    orgMinimumTenths,
    resourceName: resource ? resourceLabel(resource).name : null,
  });
  if (!disclosure) return null;

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 p-3 text-sm"
      role="status"
    >
      <Moon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{disclosure.message}</span>
    </div>
  );
}
