import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronsUpDown, Palette } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useReservationTypeColors, useUpdateOrganization } from "@/features/queries";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocsHint } from "@/components/docs-hint";
import { typeLabel } from "@/components/schedule/meta";
import {
  COLORABLE_TYPES,
  DEFAULT_TYPE_HEX,
  TYPE_COLOR_PRESETS,
  readableOnWhite,
  type ColorableType,
  type ReservationTypeColors,
} from "@/lib/reservation-type-colors";

/** The name a person reads for a color: a preset's name, else "Custom". */
function colorName(hex: string): string {
  return TYPE_COLOR_PRESETS.find((p) => p.hex === hex.toUpperCase())?.name ?? "Custom";
}

/**
 * Settings, Schedule colors: one row per reservation type, its color named in words, and a
 * menu of named colors behind it. A pick saves at once (with Undo), the way a calendar app
 * sets a calendar's color, rather than a grid of swatches per row waiting for a Save button.
 */
export function ScheduleColorsTab() {
  const { organization, rehydrate } = useAuth();
  const update = useUpdateOrganization();
  const live = useReservationTypeColors();
  const savedRaw = live.data !== undefined ? live.data : organization?.reservationTypeColors;
  const saved = useMemo<ReservationTypeColors>(() => savedRaw ?? {}, [savedRaw]);
  //What the rows show: the saved map, replaced optimistically on a pick.
  const [colors, setColors] = useState<ReservationTypeColors>(saved);
  useEffect(() => setColors(saved), [saved]);

  async function persist(next: ReservationTypeColors, previous: ReservationTypeColors, message: string) {
    setColors(next);
    try {
      //Every type is sent, a default one as null, so the stored map is exactly `next`.
      await update.mutateAsync({
        reservationTypeColors: Object.fromEntries(COLORABLE_TYPES.map((t) => [t, next[t] ?? null])),
      });
      await Promise.all([live.refetch(), rehydrate()]);
      toast.success(message, {
        action: { label: "Undo", onClick: () => void persist(previous, next, "Colors put back") },
      });
    } catch (err) {
      setColors(previous);
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the color");
    }
  }

  function pick(type: ColorableType, hex: string) {
    const upper = hex.toUpperCase();
    if (!readableOnWhite(upper)) {
      toast.error("That color is too light to read on the schedule. Pick a darker one.");
      return;
    }
    const next = { ...colors };
    //Picking the type's own default stores nothing, so it keeps following the default.
    if (upper === DEFAULT_TYPE_HEX[type]) delete next[type];
    else next[type] = upper;
    void persist(next, colors, `${typeLabel(type)} is now ${colorName(upper)}`);
  }

  if (!organization) return null;
  const customised = COLORABLE_TYPES.some((t) => colors[t]);

  return (
    <Card data-doc-shot="settings-schedule-colors">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" aria-hidden />
          Schedule colors
          <DocsHint topic="schedule-colors" />
        </CardTitle>
        <CardDescription>
          The color of each type of booking on the schedule, for everyone in your organization, on the web and in the
          app. A change saves as soon as you pick it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <SchedulePreview colors={colors} />
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" aria-label="Reservation types">
          {COLORABLE_TYPES.map((type) => (
            <TypeColorRow
              key={type}
              type={type}
              hex={colors[type] ?? DEFAULT_TYPE_HEX[type]}
              onPick={(hex) => pick(type, hex)}
            />
          ))}
        </ul>
        {customised && (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={update.isPending}
              onClick={() => void persist({}, colors, "Every type is back to its default color")}
            >
              Use default colors
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TypeColorRow({ type, hex, onPick }: { type: ColorableType; hex: string; onPick: (hex: string) => void }) {
  const custom = useRef<HTMLInputElement>(null);
  const label = typeLabel(type);
  const defaultHex = DEFAULT_TYPE_HEX[type];
  const name = colorName(hex);
  return (
    <li className="flex items-center gap-3 px-4 py-2" data-type={type}>
      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: hex }} aria-hidden />
      <span className="flex-1 text-sm font-medium">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            aria-label={`${label} color: ${name}`}
          >
            {name}
            <ChevronsUpDown className="size-3.5 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {TYPE_COLOR_PRESETS.map((p) => (
            <DropdownMenuItem key={p.hex} onSelect={() => onPick(p.hex)} className="gap-2.5">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: p.hex }} aria-hidden />
              <span className="flex-1">
                {p.name}
                {p.hex === defaultHex && <span className="ml-1.5 text-xs text-muted-foreground">Default</span>}
              </span>
              {p.hex === hex.toUpperCase() && <Check className="size-4" aria-hidden />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => custom.current?.click()} className="gap-2.5">
            <span className="size-3 shrink-0 rounded-full border border-dashed border-muted-foreground/60" aria-hidden />
            <span className="flex-1">Custom…</span>
            {name === "Custom" && <Check className="size-4" aria-hidden />}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* The system color picker, opened from Custom… in the menu. */}
      <input
        ref={custom}
        type="color"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        defaultValue={hex.toLowerCase()}
        onChange={(e) => onPick(e.target.value)}
      />
    </li>
  );
}

/**
 * The whole palette at a glance, as booking blocks on a schedule. Seeing the types side by
 * side is how anyone judges whether two are too close.
 */
function SchedulePreview({ colors }: { colors: ReservationTypeColors }) {
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3" aria-label="Preview">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Preview</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {COLORABLE_TYPES.map((type) => {
          const hex = colors[type] ?? DEFAULT_TYPE_HEX[type];
          //The board lifts colors toward white on the dark theme, so the preview does too.
          const ink = dark ? `color-mix(in oklab, ${hex} 70%, white)` : hex;
          return (
            <div
              key={type}
              className="truncate rounded-md border-l-[3px] px-2 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in oklab, ${ink} 12%, transparent)`,
                borderLeftColor: ink,
                color: ink,
              }}
            >
              {typeLabel(type)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
