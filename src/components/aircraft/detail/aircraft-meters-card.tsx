import * as React from "react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { toast } from "sonner";
import { Camera, Gauge, Plus } from "lucide-react";
import type { MeterLogEntry, Resource } from "@/types/api";
import { useMeterLog, useOwnerRecordTimes, useRecordMeterReading } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { maintenanceTriggerMessage } from "@/lib/meter-anomaly";
import { canOpenWorkOrders, canSeeShop } from "@/lib/permissions";
import { useSubmitOnce } from "@/lib/use-submit-once";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { CardEmpty, DetailCard } from "@/components/detail/detail-page";
import { ListTag } from "@/components/list-table";
import { ChipButton, DateChip } from "@/components/property-chips";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Field } from "@/components/settings/parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

/**
 * An aircraft's meter log (Murray spec section 4): every Hobbs and tach reading somebody
 * recorded, with who, when, a note and a photo of the meter, beside the readings close-outs
 * took. A customer's aircraft flies elsewhere, so its due dates are only as current as its last
 * reading: the card says so when that was over a month ago.
 */

const hours = (tenths: number | null) =>
  tenths == null
    ? "–"
    : (tenths / 10).toLocaleString("en-US", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
const SHOWN = 6;

export function AircraftMetersCard({ resource }: { resource: Resource }) {
  const { roles } = useAuth();
  // A glider or a balloon has no meters, so there is nothing to read or to go stale.
  const meterMode = resource.type?.plane?.meterMode ?? "hobbs_and_tach";
  const readable =
    canSeeShop(roles) && !!resource.type?.plane && meterMode !== "none";
  const editable = canOpenWorkOrders(roles);
  const q = useMeterLog(resource.id, { enabled: readable });
  const [recording, setRecording] = React.useState(false);
  const [all, setAll] = React.useState(false);
  if (!readable) return null;
  const log = q.data;
  const entries = log?.entries ?? [];
  const shown = all ? entries : entries.slice(0, SHOWN);

  return (
    <DetailCard
      title="Hobbs and tach"
      description="Readings somebody recorded, and the ones close-outs took."
      docShot="aircraft-meter-log"
      action={
        editable ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRecording(true)}
          >
            <Plus className="size-4" /> Record a reading
          </Button>
        ) : undefined
      }
    >
      {q.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : q.isError || !log ? (
        <CardEmpty>Couldn&apos;t load the readings.</CardEmpty>
      ) : (
        <div className="space-y-3">
          {log.stale && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
              {log.daysSinceRead == null
                ? "Nobody has recorded this aircraft's times yet. Hour-based due dates are only as current as the last reading."
                : `Times last read ${log.daysSinceRead} days ago. Hour-based due dates are only as current as the last reading.`}
              {editable && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="font-medium underline underline-offset-2"
                    onClick={() => setRecording(true)}
                  >
                    Record a reading
                  </button>
                </>
              )}
            </p>
          )}
          {entries.length === 0 ? (
            <CardEmpty>
              No readings yet. Hobbs {hours(log.current.hobbsTime)}, tach{" "}
              {hours(log.current.tachTime)} on record.
            </CardEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]" aria-label="Meter readings">
                <thead>
                  <tr className="text-left text-[12px] text-muted-foreground">
                    <th className="py-1.5 pr-3 font-normal">Read</th>
                    <th className="py-1.5 pr-3 text-right font-normal">
                      Hobbs
                    </th>
                    <th className="py-1.5 pr-3 text-right font-normal">Tach</th>
                    <th className="w-full py-1.5 font-normal">From</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => (
                    <MeterRow key={`${e.kind}-${e.id}`} entry={e} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {entries.length > SHOWN && (
            <Button variant="ghost" size="sm" onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${entries.length}`}
            </Button>
          )}
        </div>
      )}
      {editable && (
        <RecordMeterReadingModal
          open={recording}
          onOpenChange={setRecording}
          resourceId={resource.id}
          meterMode={meterMode}
          current={
            log?.current ?? {
              hobbsTime: resource.type?.plane?.hobbsTime ?? 0,
              tachTime: resource.type?.plane?.tachTime ?? 0,
            }
          }
        />
      )}
    </DetailCard>
  );
}

function MeterRow({ entry: e }: { entry: MeterLogEntry }) {
  const moved = (now: number | null, prior: number | null) =>
    now != null && prior != null && now !== prior ? `${hours(prior)} → ` : "";
  return (
    <tr className="border-t border-border align-top">
      <td className="py-2 pr-3 whitespace-nowrap">{formatDate(e.readAt)}</td>
      <td className="tnum py-2 pr-3 text-right whitespace-nowrap">
        {e.hobbsTime == null ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          hours(e.hobbsTime)
        )}
      </td>
      <td className="tnum py-2 pr-3 text-right whitespace-nowrap">
        {e.tachTime == null ? (
          <span className="text-muted-foreground">–</span>
        ) : (
          hours(e.tachTime)
        )}
      </td>
      <td className="min-w-0 py-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {e.kind === "close-out" ? (
            e.reservationId != null ? (
              <Link
                to="/schedule/reservations/$reservationId"
                params={{ reservationId: String(e.reservationId) }}
                className="underline-offset-2 hover:underline"
              >
                Close-out
              </Link>
            ) : (
              <span>Close-out</span>
            )
          ) : (
            <span>{e.by?.name ?? "Recorded"}</span>
          )}
          {e.correction && <ListTag>Correction</ListTag>}
          {e.photoUrl && (
            <a
              href={e.photoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Camera className="size-3.5" /> Photo
            </a>
          )}
        </div>
        {e.kind === "reading" &&
          (moved(e.hobbsTime, e.priorHobbsTime) ||
            moved(e.tachTime, e.priorTachTime)) && (
            <p className="text-[12px] text-muted-foreground">
              {[
                e.hobbsTime != null &&
                e.priorHobbsTime != null &&
                e.hobbsTime !== e.priorHobbsTime
                  ? `Hobbs was ${hours(e.priorHobbsTime)}`
                  : null,
                e.tachTime != null &&
                e.priorTachTime != null &&
                e.tachTime !== e.priorTachTime
                  ? `tach was ${hours(e.priorTachTime)}`
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        {e.note && (
          <p className="text-[12px] whitespace-pre-wrap text-muted-foreground">
            {e.note}
          </p>
        )}
      </td>
    </tr>
  );
}

/** "1234.5" or "1,234.5" typed as hours, to tenths; null for empty, undefined for not a number. */
function tenthsFrom(text: string): number | null | undefined {
  if (!text.trim()) return null;
  const n = Number(text.replace(/,/g, "").trim());
  if (!Number.isFinite(n) || n < 0) return undefined;
  return Math.round(n * 10);
}

export function RecordMeterReadingModal({
  open,
  onOpenChange,
  resourceId,
  meterMode = "hobbs_and_tach",
  current,
  asOwner = false,
  title = "Record a reading",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resourceId: number;
  /** Names the aircraft where the reading is not opened from its own page ("Update N3061K's times"). */
  title?: string;
  meterMode?: "hobbs_and_tach" | "hobbs_only" | "tach_only" | "none";
  current: { hobbsTime: number; tachTime: number };
  /** The aircraft's owner recording their own aircraft's times, through /owner. */
  asOwner?: boolean;
}) {
  const hasHobbs = meterMode !== "tach_only";
  const hasTach = meterMode !== "hobbs_only";
  const shopRecord = useRecordMeterReading(resourceId);
  const ownerRecord = useOwnerRecordTimes(resourceId);
  const record = asOwner ? ownerRecord : shopRecord;
  const confirm = useConfirm();
  const once = useSubmitOnce(open);
  const today = format(new Date(), "yyyy-MM-dd");
  const [hobbs, setHobbs] = React.useState("");
  const [tach, setTach] = React.useState("");
  const [readOn, setReadOn] = React.useState(today);
  const [note, setNote] = React.useState("");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // The server's "lower than on record" question, answered in the form: a slipped digit put
  // right, or a replaced meter. Only the second carries the airframe's total time forward from
  // the new meter, so it is a choice, not a single "save anyway".
  const [lower, setLower] = React.useState<string | null>(null);
  const [why, setWhy] = React.useState<"typo" | "replaced">("typo");
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setLower(null);
    setWhy("typo");
    setHobbs("");
    setTach("");
    setReadOn(format(new Date(), "yyyy-MM-dd"));
    setNote("");
    setPhoto(null);
    setError(null);
  }, [open]);

  const submit = async () => {
    const h = hasHobbs ? tenthsFrom(hobbs) : null;
    const t = hasTach ? tenthsFrom(tach) : null;
    if (h === undefined || t === undefined)
      return setError("Hours are a number, like 2461.2.");
    if (h == null && t == null)
      return setError(
        hasHobbs && hasTach
          ? "Enter the Hobbs, the tach, or both."
          : hasHobbs
            ? "Enter the Hobbs."
            : "Enter the tach.",
      );
    if (!once.begin()) return;
    setError(null);
    // Today means now; another day means midday that day, so it never lands in the future or
    // the day before in another zone.
    const readAt =
      readOn && readOn !== today
        ? new Date(`${readOn}T12:00:00`).toISOString()
        : null;
    const body = {
      hobbsTime: h,
      tachTime: t,
      readAt,
      note: note.trim() || null,
      photo,
    };
    const send = async (flags: {
      confirmLower?: boolean;
      meterReplaced?: boolean;
      confirmMaintenanceTrigger?: boolean;
    }): Promise<boolean> => {
      try {
        const { uploadError, appliedToAircraft } = await record.mutateAsync({ ...body, ...flags });
        if (uploadError) toast.error(`The reading was saved without its photo, which did not upload: ${uploadError}`);
        else if (!appliedToAircraft) toast.success("Saved to the log. A newer reading is on record, so the aircraft's times stay as they are.");
        else toast.success("Reading recorded");
        return true;
      } catch (e) {
        const code =
          e instanceof ApiError && e.status === 409
            ? (e.body as { code?: string } | null)?.code
            : null;
        if (code === "METER_LOWER") {
          setLower((e as Error).message);
          return false;
        }
        const trigger = maintenanceTriggerMessage(e);
        if (trigger) {
          const ok = await confirm({
            title: "This reading grounds the aircraft",
            description: trigger,
            confirmLabel: "Save and ground it",
            destructive: true,
          });
          return ok
            ? send({ ...flags, confirmMaintenanceTrigger: true })
            : false;
        }
        setError(
          e instanceof Error ? e.message : "Couldn't record the reading",
        );
        return false;
      }
    };
    const answered = lower ? (why === "replaced" ? { confirmLower: true, meterReplaced: true } : { confirmLower: true }) : {};
    if (await send(answered)) onOpenChange(false);
    else once.fail();
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      size="sm"
      title={title}
      description={
        hasHobbs && hasTach
          ? `On record: Hobbs ${hours(current.hobbsTime)}, tach ${hours(current.tachTime)}. Enter either or both.`
          : hasHobbs
            ? `On record: Hobbs ${hours(current.hobbsTime)}.`
            : `On record: tach ${hours(current.tachTime)}.`
      }
      dataDocShot="record-meter-reading"
      footer={
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={record.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={record.isPending}>
            {record.isPending ? "Saving…" : lower ? "Save correction" : "Record"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          void submit();
        }}
      >
        <div
          className={
            hasHobbs && hasTach ? "grid grid-cols-2 gap-3" : "grid gap-3"
          }
        >
          {hasHobbs && (
            <Field label="Hobbs" htmlFor="meter-hobbs">
              <Input
                id="meter-hobbs"
                inputMode="decimal"
                autoComplete="off"
                placeholder={hours(current.hobbsTime).replace(/,/g, "")}
                value={hobbs}
                onChange={(ev) => {
                  setHobbs(ev.target.value);
                  setLower(null);
                }}
                aria-invalid={
                  !!error && !hobbs.trim() && !tach.trim() ? true : undefined
                }
              />
            </Field>
          )}
          {hasTach && (
            <Field label="Tach" htmlFor="meter-tach">
              <Input
                id="meter-tach"
                inputMode="decimal"
                autoComplete="off"
                placeholder={hours(current.tachTime).replace(/,/g, "")}
                value={tach}
                onChange={(ev) => {
                  setTach(ev.target.value);
                  setLower(null);
                }}
                aria-invalid={
                  !!error && !hasHobbs && !tach.trim() ? true : undefined
                }
              />
            </Field>
          )}
        </div>
        {lower && (
          <div role="alert" className="space-y-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] dark:border-amber-800 dark:bg-amber-950/40" data-doc-shot="meter-lower-choice">
            <p className="text-amber-950 dark:text-amber-100">{lower.includes(". Save it") ? `${lower.split(". Save it")[0]}.` : lower} Why is it lower?</p>
            <RadioGroup value={why} onValueChange={(v) => setWhy(v as "typo" | "replaced")} aria-label="Why the reading is lower">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="typo" id="meter-lower-typo" className="mt-0.5" />
                <Label htmlFor="meter-lower-typo" className="block font-normal leading-snug">
                  The last reading was mistyped
                  <span className="block text-[12px] text-muted-foreground">The meters go back to this reading. Total time is unchanged.</span>
                </Label>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="replaced" id="meter-lower-replaced" className="mt-0.5" />
                <Label htmlFor="meter-lower-replaced" className="block font-normal leading-snug">
                  The meter was replaced
                  <span className="block text-[12px] text-muted-foreground">Total time keeps counting from the new meter.</span>
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}
        <Field label="Note" htmlFor="meter-note">
          <Textarea
            id="meter-note"
            rows={2}
            maxLength={500}
            placeholder="Read at drop-off. Owner's logbook shows the same."
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-1.5">
          <DateChip
            id="meter-read-on"
            name="Read on"
            empty="Today"
            prefix="Read "
            value={readOn}
            onChange={(v) => setReadOn(v || today)}
          />
          <ChipButton
            leading={<Camera className="size-3.5" />}
            set={!!photo}
            onClick={() => fileRef.current?.click()}
            aria-label={
              photo ? `Meter photo: ${photo.name}` : "Add a photo of the meter"
            }
          >
            {photo ? photo.name : "Photo of the meter"}
          </ChipButton>
          {photo && (
            <button
              type="button"
              className="text-[12px] text-muted-foreground hover:text-foreground"
              onClick={() => setPhoto(null)}
            >
              Remove photo
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,application/pdf,.heic,.heif"
            className="hidden"
            data-testid="meter-photo-input"
            onChange={(ev) => {
              const f = ev.target.files?.[0] ?? null;
              ev.target.value = "";
              if (f) setPhoto(f);
            }}
          />
        </div>
        {error && (
          <p
            role="alert"
            className="flex items-center gap-1.5 text-[13px] text-destructive"
          >
            <Gauge className="size-4" /> {error}
          </p>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </ResponsiveModal>
  );
}
