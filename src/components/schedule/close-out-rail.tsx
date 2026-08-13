import { Check } from "lucide-react";
import type { CloseOutStep } from "./close-out";
import { cn } from "@/lib/utils";

/**
 * Where this booking is, in one line.
 *
 * The close-out used to state its position three different ways at once: a heading that
 * changed word ("Dispatch" or "Close-out"), a badge that changed colour, and a sentence of
 * prose that changed with both. Three readings of one fact, none of which said what came
 * next, on the screen a dispatcher looks at more than any other.
 *
 * This is the one reading. Done steps carry a tick, the live step is filled and labelled in
 * full, and the steps still to come are dim. What is left to do is the part still grey,
 * which is the question somebody opening a booking is actually asking.
 *
 * A booking with no meters never ramps, so it is given the three steps it really has rather
 * than a greyed-out aeroplane stage it can never reach.
 */

type Stop = { key: string; label: string };

const FLIGHT_STOPS: Stop[] = [
  { key: "rampOut", label: "Dispatch" },
  { key: "rampIn", label: "In flight" },
  { key: "confirm", label: "Review" },
  { key: "invoiced", label: "Billed" },
];

const GROUND_STOPS: Stop[] = [
  { key: "rampOut", label: "Times" },
  { key: "confirm", label: "Review" },
  { key: "invoiced", label: "Billed" },
];

/**
 * How far along each step sits. `confirmGuest` shares the review stop (a guest booking is
 * reviewed by staff instead of by PIN, which is a different door into the same room), and
 * `reviewed` sits between review and billing: signed off, not yet billed.
 */
const POSITION: Record<CloseOutStep, number> = {
  rampOut: 0,
  rampIn: 1,
  confirm: 2,
  confirmGuest: 2,
  reviewed: 3,
  invoiced: 4,
};

const GROUND_POSITION: Record<CloseOutStep, number> = {
  rampOut: 0,
  rampIn: 0,
  confirm: 1,
  confirmGuest: 1,
  reviewed: 2,
  invoiced: 3,
};

export function CloseOutRail({
  step,
  noMeters,
  className,
}: {
  step: CloseOutStep;
  /** A booking with nothing to ramp: a ground lesson, or anything with no aircraft. */
  noMeters: boolean;
  className?: string;
}) {
  const stops = noMeters ? GROUND_STOPS : FLIGHT_STOPS;
  const at = (noMeters ? GROUND_POSITION : POSITION)[step];
  // Signed off, no money yet. `reviewed` maps onto the Billed index so Review
  // can tick; lighting Billed as live read as "this flight is billed".
  const awaitingBill = step === "reviewed";

  return (
    <ol
      data-doc-shot="close-out-rail"
      className={cn("flex items-center gap-1", className)}
      aria-label="Close-out progress"
    >
      {stops.map((stop, i) => {
        const done = i < (awaitingBill ? stops.length - 1 : at);
        const live = !awaitingBill && i === at && at < stops.length;
        return (
          <li key={stop.key} className="flex min-w-0 items-center gap-1">
            {i > 0 && (
              <span
                aria-hidden
                className={cn("h-px w-3 shrink-0", done || live ? "bg-primary/40" : "bg-border")}
              />
            )}
            <span
              className={cn(
                "flex items-center gap-1 rounded-full py-0.5 text-xs",
                live ? "bg-primary/10 px-2 font-medium text-foreground" : "px-1",
                done && "text-muted-foreground",
                !done && !live && "text-muted-foreground/50"
              )}
              aria-current={live ? "step" : undefined}
            >
              {done ? (
                <Check className="size-3 shrink-0 text-success" aria-hidden />
              ) : (
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    live ? "bg-primary" : "bg-muted-foreground/30"
                  )}
                />
              )}
              <span className="truncate">{stop.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
