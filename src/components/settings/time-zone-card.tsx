/**
 * Time zone settings — the school's field, and the member's own.
 *
 * Two cards because they answer two different questions, and conflating them is exactly the
 * bug this feature exists to fix:
 *
 * - **The school's zone** is an operational fact about the airport. It decides what time a
 *   9am lesson is *for everyone*, and only an admin sets it.
 * - **My zone** is about the person reading the screen. It never moves anyone's booking; at
 *   most it adds "…and that's 8am where you are."
 *
 * Both are quiet by default. If the org has no zone set, the schedule keeps rendering in the
 * viewer's zone exactly as it does today — so this is opt-in, and unsetting it is a real
 * choice rather than a broken state.
 */

import * as React from "react";
import { Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  useTimeZonePreferences,
  useUpdateTimeZonePreferences,
  useUpdateOrganizationTimeZone,
} from "@/features/queries";
import {
  COMMON_TIME_ZONES,
  DEVICE_TIME_ZONE,
  allTimeZones,
  describeZone,
  zoneAbbreviation,
  zonesAgreeAt,
} from "@/lib/timezone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, type ComboOption } from "@/components/combobox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Common zones first, then everything else — 400+ names is correct and unusable unsorted. */
function zoneOptions(): ComboOption[] {
  const common = COMMON_TIME_ZONES.map((z) => ({ value: z.value, label: z.label }));
  const seen = new Set(common.map((c) => c.value));

  const rest = allTimeZones()
    .filter((z) => !seen.has(z))
    .map((z) => ({ value: z, label: z.replace(/_/g, " ") }));

  return [...common, ...rest];
}

/** The school's primary zone. Admin-only — it changes what time a lesson is for everyone. */
export function OrganizationTimeZoneCard() {
  const { organization, rehydrate } = useAuth();
  const update = useUpdateOrganizationTimeZone();
  const options = React.useMemo(zoneOptions, []);

  const current = organization?.timeZone ?? "";

  const save = (value: string) => {
    update.mutate(value || null, {
      onSuccess: async () => {
        toast.success(value ? `Schedule now shows ${describeZone(value)}` : "Time zone cleared");
        await rehydrate();
      },
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Couldn't save the time zone"),
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Globe className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm">Time zone</CardTitle>
        {update.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="org-timezone">Where you fly from</Label>
          <Combobox
            options={options}
            value={current}
            onChange={save}
            placeholder="Not set"
            searchPlaceholder="Search time zones…"
            emptyText="No matching zone."
            disabled={update.isPending}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          The schedule shows times at your field, so a 9:00 AM lesson stays 9:00 AM for
          everyone — including anyone travelling. Times get a zone label only when the person
          reading is somewhere else.
        </p>

        {!current && (
          <p className="text-xs text-muted-foreground">
            Not set, so times currently show in each person&apos;s own zone — which is what
            makes the schedule look different when someone travels.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** The member's own zone, and whether the schedule follows it. Everyone gets this. */
export function MyTimeZoneCard() {
  const prefs = useTimeZonePreferences();
  const update = useUpdateTimeZonePreferences();
  const { organization } = useAuth();
  const options = React.useMemo(zoneOptions, []);

  const mode = prefs.data?.timeZoneMode ?? "auto";
  const scheduleMode = prefs.data?.scheduleTimeZoneMode ?? "location";
  const pinned = prefs.data?.timeZone ?? "";

  const effective = mode === "manual" && pinned ? pinned : DEVICE_TIME_ZONE;
  const orgZone = organization?.timeZone ?? null;
  const travelling = orgZone != null && !zonesAgreeAt(new Date(), orgZone, effective);

  const save = (patch: Parameters<typeof update.mutate>[0]) => {
    update.mutate(patch, {
      onError: (err) =>
        toast.error(err instanceof ApiError ? err.message : "Couldn't save that preference"),
    });
  };

  return (
    <Card data-doc-shot="profile-time-zone-card">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Globe className="size-4 text-muted-foreground" />
        <CardTitle className="text-sm">My time zone</CardTitle>
        {update.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="my-tz-mode">Time zone</Label>
          <Select
            value={mode}
            onValueChange={(v) => save({ timeZoneMode: v as "auto" | "manual" })}
            disabled={update.isPending || prefs.isLoading}
          >
            <SelectTrigger id="my-tz-mode" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* Follows the operating system, which already updates itself as you travel.
                  No location permission is involved — the OS knows its own zone. */}
              <SelectItem value="auto">
                Automatic — {describeZone(DEVICE_TIME_ZONE)}
              </SelectItem>
              <SelectItem value="manual">Choose a time zone</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {mode === "manual" && (
          <div className="space-y-1.5">
            <Label htmlFor="my-tz">Zone</Label>
            <Combobox
              options={options}
              value={pinned}
              onChange={(v) => save({ timeZone: v })}
              placeholder="Pick a zone"
              searchPlaceholder="Search time zones…"
              emptyText="No matching zone."
              disabled={update.isPending}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="schedule-tz">Show the schedule in</Label>
          <Select
            value={scheduleMode}
            onValueChange={(v) => save({ scheduleTimeZoneMode: v as "location" | "user" })}
            disabled={update.isPending || prefs.isLoading}
          >
            <SelectTrigger id="schedule-tz" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="location">Airport time (recommended)</SelectItem>
              <SelectItem value="user">My time zone</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Airport time keeps a 9:00 AM lesson at 9:00 AM wherever you are, which is what the
            aircraft and your instructor are going by. Either way, times are labelled when the
            two differ.
          </p>
        </div>

        {travelling && orgZone && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            You&apos;re currently {zoneAbbreviation(new Date(), effective)}, and your school
            flies {zoneAbbreviation(new Date(), orgZone)}. Times on the schedule are labelled
            so you can tell them apart.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
