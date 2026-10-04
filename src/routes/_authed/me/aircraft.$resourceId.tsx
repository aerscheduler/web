import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { Gauge, PlaneTakeoff, Wrench } from "lucide-react";
import { useOwnerAircraftDetail } from "@/features/queries";
import { formatDate } from "@/lib/utils";
import { CardEmpty, CardSkeleton, DetailBack, DetailCard, DetailHeader, MetaItem, RecordNotFound, isMissingRecord, useDetailTitle } from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { AircraftPicture, DueLine, JobStatus, RequestWorkModal } from "@/components/owner/owner-parts";
import { RecordMeterReadingModal } from "@/components/aircraft/detail/aircraft-meters-card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authed/me/aircraft/$resourceId")({
  component: OwnerAircraftPage,
});

const hours = (tenths: number | null) => (tenths == null ? "–" : (tenths / 10).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

/** One of the owner's aircraft: the jobs on it, everything coming due, and its times. */
function OwnerAircraftPage() {
  const { resourceId } = Route.useParams();
  const id = Number(resourceId);
  const q = useOwnerAircraftDetail(Number.isFinite(id) ? id : null);
  const [asking, setAsking] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const a = q.data;
  useDetailTitle(a?.tailNumber ?? null);
  const back = { to: "/me", label: "Home" };

  if (q.isPending) return <CardSkeleton rows={5} />;
  if (isMissingRecord(q.error) || (!q.isError && !a)) {
    return <RecordNotFound icon={PlaneTakeoff} title="Aircraft not found" body="That link doesn't point at an aircraft of yours." backTo={back.to} backLabel={`Back to ${back.label}`} />;
  }
  if (q.isError || !a) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-5">
      <DetailBack to={back.to} label={back.label} />
      <DetailHeader
        media={<AircraftPicture a={a} className="size-16" />}
        title={a.tailNumber ?? "Aircraft"}
        titleClassName="font-mono"
        subtitle={[a.year, a.make, a.model].filter(Boolean).join(" ") || undefined}
        meta={
          <>
            {a.use === "shop" ? <MetaItem icon={Wrench}>In the shop's care</MetaItem> : <MetaItem icon={PlaneTakeoff}>On the organization's line</MetaItem>}
            {a.meterMode !== "none" && (
              <MetaItem icon={Gauge}>
                {a.meterMode !== "tach_only" && `Hobbs ${hours(a.hobbsTime)}`}
                {a.meterMode === "hobbs_and_tach" && ", "}
                {a.meterMode !== "hobbs_only" && `tach ${hours(a.tachTime)}`}
              </MetaItem>
            )}
          </>
        }
        actions={
          <>
            {a.mayRecordTimes && (
              <Button variant="outline" onClick={() => setRecording(true)}>
                <Gauge className="size-4" /> Update times
              </Button>
            )}
            <Button onClick={() => setAsking(true)}>Request work</Button>
          </>
        }
      />

      {a.grounded && (
        <p className="rounded-lg border border-[color-mix(in_oklch,var(--warning)_35%,transparent)] bg-[color-mix(in_oklch,var(--warning)_12%,transparent)] px-3.5 py-2.5 text-[13px] font-semibold text-warning">
          Not airworthy until the shop returns it to service.
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DetailCard title="Work with the shop" description="Every job on this aircraft, newest first.">
          {a.jobs.length === 0 ? (
            <CardEmpty>No work yet. Request work and the shop will get in touch.</CardEmpty>
          ) : (
            <ul className="divide-y divide-border" aria-label="Jobs">
              {a.jobs.map((j) => (
                <li key={j.id} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link to="/me/jobs/$workOrderId" params={{ workOrderId: String(j.id) }} className="text-[13px] font-medium underline-offset-2 hover:underline">
                      {j.label}
                    </Link>
                    {j.request && <p className="line-clamp-2 text-[13px] text-muted-foreground">{j.request}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
                    <JobStatus job={j} />
                    <span className="text-[12px] text-muted-foreground">
                      {j.completedAt ? `Finished ${formatDate(j.completedAt)}` : j.promisedOn ? `Back by ${format(parseISO(j.promisedOn), "MMM d")}` : `Opened ${formatDate(j.openedAt)}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DetailCard>

        <div className="space-y-5">
          <DetailCard title="Coming due" description="Inspections the shop tracks on this aircraft.">
            {a.due.length === 0 ? (
              <CardEmpty>Nothing tracked yet.</CardEmpty>
            ) : (
              <ul className="space-y-1.5">
                {a.due.map((d, i) => (
                  <DueLine key={i} item={d} />
                ))}
              </ul>
            )}
          </DetailCard>

          {a.meterMode !== "none" && (
            <DetailCard
              title="Hobbs and tach"
              description={
                a.lastReadAt
                  ? `Last read ${a.daysSinceRead === 0 ? "today" : `${a.daysSinceRead} day${a.daysSinceRead === 1 ? "" : "s"} ago`}.`
                  : "Not read yet."
              }
              action={
                a.mayRecordTimes ? (
                  <Button size="sm" variant="outline" onClick={() => setRecording(true)}>
                    Update times
                  </Button>
                ) : undefined
              }
            >
              {a.use === "shop" && (a.daysSinceRead == null || a.daysSinceRead > 30) && (
                <p className="mb-2 text-[13px] text-amber-800 dark:text-amber-300">
                  Due dates counted in hours are only as current as the last reading. Update the times after you fly.
                </p>
              )}
              {a.readings.length === 0 ? (
                <CardEmpty>No readings yet.</CardEmpty>
              ) : (
                <table className="w-full text-[13px]" aria-label="Readings">
                  <thead>
                    <tr className="text-left text-[12px] text-muted-foreground">
                      <th className="py-1 pr-3 font-normal">Read</th>
                      <th className="py-1 pr-3 text-right font-normal">Hobbs</th>
                      <th className="py-1 text-right font-normal">Tach</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.readings.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1.5 pr-3">{formatDate(r.readAt)}</td>
                        <td className="tnum py-1.5 pr-3 text-right">{hours(r.hobbsTime)}</td>
                        <td className="tnum py-1.5 text-right">{hours(r.tachTime)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DetailCard>
          )}
        </div>
      </div>

      {asking && <RequestWorkModal open onOpenChange={(o) => !o && setAsking(false)} aircraft={a} />}
      {a.mayRecordTimes && (
        <RecordMeterReadingModal
          open={recording}
          onOpenChange={setRecording}
          resourceId={a.id}
          meterMode={a.meterMode}
          current={{ hobbsTime: a.hobbsTime ?? 0, tachTime: a.tachTime ?? 0 }}
          asOwner
          title={a.tailNumber ? `Update ${a.tailNumber}'s times` : "Update times"}
        />
      )}
    </div>
  );
}
