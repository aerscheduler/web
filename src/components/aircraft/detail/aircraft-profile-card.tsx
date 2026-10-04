import { toast } from "sonner";
import type { Resource } from "@/types/api";
import { useAircraftProfile, useUpdateAircraftProfile } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders, canSeeShop } from "@/lib/permissions";
import { CardEmpty, DetailCard } from "@/components/detail/detail-page";
import { EditableProperty } from "@/components/detail/editable-property";
import { Skeleton } from "@/components/ui/skeleton";

/** Tenths of an hour as hours, one decimal, grouped: 62140 → "6,214.0". */
const hours = (tenths: number) => (tenths / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "6214.0" or "6,214" typed as hours, to tenths; null for empty, undefined for not a number. */
function tenthsFrom(text: string | null): number | null | undefined {
  if (text == null || !text.trim()) return null;
  const n = Number(text.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 10);
}

/**
 * The airframe beyond its registration (Murray spec section 3): total time, engine, propeller,
 * notes. Read by anyone who sees the shop; changed by the people who work on aircraft (owners,
 * admins, technicians), in place. Total time is carried forward by the Hobbs flown since it was
 * read, so it is entered once, not after every flight.
 */
export function AircraftProfileCard({ resource }: { resource: Resource }) {
  const { roles } = useAuth();
  const readable = canSeeShop(roles) && !!resource.type?.plane;
  const editable = canOpenWorkOrders(roles);
  const q = useAircraftProfile(resource.id, { enabled: readable });
  const update = useUpdateAircraftProfile(resource.id);
  // Total time moves with the Hobbs, or with the tach on an aircraft that has only a tach.
  const craft = resource.type?.plane;
  const meterName = craft?.meterMode === "tach_only" ? "tach" : "Hobbs";
  const meterNow = craft ? (craft.meterMode === "tach_only" ? craft.tachTime : craft.hobbsTime) : null;
  if (!readable) return null;
  const p = q.data;

  const save = async (patch: Parameters<typeof update.mutateAsync>[0], what: string) => {
    try {
      await update.mutateAsync(patch);
      toast.success(`${what} saved`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Couldn't save the ${what.toLowerCase()}`);
      return false;
    }
  };
  const pair = (a: string | null | undefined, b: string | null | undefined, bLabel: string) =>
    a || b ? [a, b ? `${bLabel} ${b}` : null].filter(Boolean).join(", ") : null;

  return (
    <DetailCard
      title="Airframe, engine and propeller"
      description={editable ? "What the shop keeps about this aircraft. Click a value to change it." : "What the shop keeps about this aircraft."}
      docShot="aircraft-profile"
    >
      {q.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : q.isError || !p ? (
        <CardEmpty>Couldn&apos;t load these details.</CardEmpty>
      ) : (
        <div className="space-y-0.5">
          <EditableProperty
            label="Total time"
            shown={
              p.airframeTotalNowTenths != null ? (
                <span className="tnum">
                  {hours(p.airframeTotalNowTenths)} h
                  {p.airframeTotalAtHobbs != null && p.airframeTotalTenths != null && p.airframeTotalNowTenths !== p.airframeTotalTenths && (
                    <span className="ml-1.5 text-muted-foreground">
                      ({hours(p.airframeTotalTenths)} at {meterName} {hours(p.airframeTotalAtHobbs)}, plus flying since)
                    </span>
                  )}
                </span>
              ) : null
            }
            fields={[
              { key: "total", label: "Airframe total time, hours", placeholder: "6214.0", inputMode: "decimal" },
              // The total is carried forward from the meter reading it was taken at. Defaulting
              // to the stored meter counted the hours flown elsewhere twice when that was stale.
              { key: "at", label: `Read at ${meterName}`, placeholder: meterNow != null ? (meterNow / 10).toFixed(1) : "2461.2", inputMode: "decimal" },
            ]}
            values={{
              total: p.airframeTotalNowTenths != null ? (p.airframeTotalNowTenths / 10).toFixed(1) : null,
              at: meterNow != null ? (meterNow / 10).toFixed(1) : null,
            }}
            editable={editable}
            onSave={async (v) => {
              const t = tenthsFrom(v.total);
              const at = tenthsFrom(v.at);
              if (t === undefined || at === undefined) {
                toast.error("Hours are a number, like 6214.0.");
                return false;
              }
              return save(t == null ? { airframeTotalTenths: null } : { airframeTotalTenths: t, ...(at != null ? { airframeTotalAtHobbs: at } : {}) }, "Total time");
            }}
          />
          <EditableProperty
            label="Engine"
            shown={pair(p.engineModel, p.engineSerial, "S/N")}
            fields={[
              { key: "engineModel", label: "Engine model", placeholder: "Lycoming O-360-A4M", maxLength: 60 },
              { key: "engineSerial", label: "Engine serial number", placeholder: "L-12345-36A", maxLength: 40 },
            ]}
            values={{ engineModel: p.engineModel, engineSerial: p.engineSerial }}
            editable={editable}
            onSave={(v) => save({ engineModel: v.engineModel, engineSerial: v.engineSerial }, "Engine")}
          />
          <EditableProperty
            label="Propeller"
            shown={pair(p.propModel, p.propSerial, "S/N")}
            fields={[
              { key: "propModel", label: "Propeller model", placeholder: "Sensenich 76EM8S14-0-62", maxLength: 60 },
              { key: "propSerial", label: "Propeller serial number", placeholder: "K12345", maxLength: 40 },
            ]}
            values={{ propModel: p.propModel, propSerial: p.propSerial }}
            editable={editable}
            onSave={(v) => save({ propModel: v.propModel, propSerial: v.propSerial }, "Propeller")}
          />
          <EditableProperty
            label="Notes"
            shown={p.notes}
            empty="No notes"
            fields={[{ key: "notes", label: "Notes for the shop", placeholder: "Hangar 3. Owner keeps the logbooks at home.", multiline: true, maxLength: 2000 }]}
            values={{ notes: p.notes }}
            editable={editable}
            onSave={(v) => save({ notes: v.notes }, "Notes")}
          />
        </div>
      )}
    </DetailCard>
  );
}
