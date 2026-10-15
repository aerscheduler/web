import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Palette, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { useReservationTypeColors, useUpdateOrganization } from "@/features/queries";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DocsHint } from "@/components/docs-hint";
import { cn } from "@/lib/utils";
import { typeLabel } from "@/components/schedule/meta";
import {
  COLORABLE_TYPES,
  DEFAULT_TYPE_HEX,
  TYPE_COLOR_PRESETS,
  readableOnWhite,
  type ColorableType,
  type ReservationTypeColors,
} from "@/lib/reservation-type-colors";

/**
 * Settings, Schedule colors: the color each reservation type is drawn in, for everyone in
 * the organization, on the console and in the app.
 *
 * Changes are a draft until Save, previewed on each row as a booking block would look.
 * A type left on Default is not stored, so it follows the product's default.
 */
export function ScheduleColorsTab() {
  const { organization, rehydrate } = useAuth();
  const update = useUpdateOrganization();
  const live = useReservationTypeColors();
  const savedRaw = live.data !== undefined ? live.data : organization?.reservationTypeColors;
  const saved = useMemo(() => savedRaw ?? {}, [savedRaw]);
  const [draft, setDraft] = useState<ReservationTypeColors>(saved);
  useEffect(() => setDraft(saved), [saved]);

  const dirty = COLORABLE_TYPES.some((t) => (draft[t] ?? null) !== (saved[t as ColorableType] ?? null));
  const customised = COLORABLE_TYPES.some((t) => draft[t]);

  const pick = (type: ColorableType, hex: string | null) => {
    if (hex && !readableOnWhite(hex)) {
      toast.error("That color is too light to read on the schedule. Pick a darker one.");
      return;
    }
    setDraft((d) => {
      const next = { ...d };
      if (hex == null || hex.toUpperCase() === DEFAULT_TYPE_HEX[type]) delete next[type];
      else next[type] = hex.toUpperCase();
      return next;
    });
  };

  async function save() {
    try {
      //Every type is sent, a reset one as null, so the stored map is exactly the draft.
      const body = Object.fromEntries(COLORABLE_TYPES.map((t) => [t, draft[t] ?? null]));
      await update.mutateAsync({ reservationTypeColors: body });
      await Promise.all([rehydrate(), live.refetch()]);
      toast.success("Schedule colors saved");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't save the colors");
    }
  }

  if (!organization) return null;

  return (
    <Card data-doc-shot="settings-schedule-colors">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4 text-muted-foreground" aria-hidden />
          Schedule colors
          <DocsHint topic="schedule-colors" />
        </CardTitle>
        <CardDescription>
          The color each reservation type has on the schedule, for everyone in your organization, on the web and in
          the app.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border p-0">
        {COLORABLE_TYPES.map((type) => {
          const current = draft[type] ?? DEFAULT_TYPE_HEX[type];
          const isDefault = !draft[type];
          const isCustom = !isDefault && !TYPE_COLOR_PRESETS.some((p) => p.hex === current.toUpperCase());
          return (
            <div key={type} className="flex flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <BlockPreview hex={current} label={typeLabel(type)} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={`${typeLabel(type)} color`}>
                {TYPE_COLOR_PRESETS.map((p) => {
                  const selected = current.toUpperCase() === p.hex;
                  return (
                    <button
                      key={p.hex}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={p.name}
                      title={p.name}
                      onClick={() => pick(type, p.hex)}
                      className={cn(
                        "grid size-6 place-items-center rounded-full ring-offset-2 ring-offset-card transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected && "ring-2 ring-foreground/70"
                      )}
                      style={{ backgroundColor: p.hex }}
                    >
                      {selected && <Check className="size-3.5 text-white" aria-hidden />}
                    </button>
                  );
                })}
                <label
                  className={cn(
                    "relative grid size-6 cursor-pointer place-items-center rounded-full text-[10px] ring-offset-2 ring-offset-card focus-within:ring-2 focus-within:ring-ring",
                    isCustom ? "ring-2 ring-foreground/70" : "border border-dashed border-muted-foreground/50 text-muted-foreground"
                  )}
                  style={isCustom ? { backgroundColor: current } : undefined}
                  title={isCustom ? `Custom color ${current}` : "Custom color"}
                >
                  {isCustom ? <Check className="size-3.5 text-white" aria-hidden /> : "+"}
                  <input
                    type="color"
                    aria-label={`Custom ${typeLabel(type)} color`}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    value={current.toLowerCase()}
                    onChange={(e) => pick(type, e.target.value)}
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-7 px-2 text-xs"
                  disabled={isDefault}
                  onClick={() => pick(type, null)}
                >
                  Default
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
      <CardFooter className="justify-end gap-2 border-t border-border pt-4">
        {customised && (
          <Button type="button" variant="ghost" onClick={() => setDraft({})} disabled={update.isPending}>
            <RotateCcw className="size-4" /> All default
          </Button>
        )}
        <Button type="button" onClick={() => void save()} disabled={!dirty || update.isPending}>
          {update.isPending && <Loader2 className="size-4 animate-spin" />}
          Save
        </Button>
      </CardFooter>
    </Card>
  );
}

/** A booking block as the board draws it: tinted fill, colored edge and title. */
function BlockPreview({ hex, label }: { hex: string; label: string }) {
  //The board lifts every color toward white on the dark theme (see typeColorsCss), so the
  //preview does too, or a navy would look fine here and vanish on the schedule.
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const ink = dark ? `color-mix(in oklab, ${hex} 70%, white)` : hex;
  return (
    <div
      className="w-40 rounded-md border px-2.5 py-1.5 text-xs font-medium"
      style={{
        backgroundColor: `color-mix(in oklab, ${ink} 12%, transparent)`,
        borderColor: `color-mix(in oklab, ${ink} 40%, transparent)`,
        color: ink,
      }}
    >
      {label}
      <span className="ml-1.5 font-normal opacity-80">9:00 AM</span>
    </div>
  );
}
