import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { CalendarClock, FileText, ImageOff, Loader2, MessageSquareWarning, Paperclip, PlaneTakeoff, Receipt } from "lucide-react";
import { useAnswerItems, useOwnerAttach, useOwnerJob } from "@/features/queries";
import { formatDate, formatMoney } from "@/lib/utils";
import { CardEmpty, CardSkeleton, DetailBack, DetailCard, DetailHeader, MetaItem, RecordNotFound, isMissingRecord, useDetailTitle } from "@/components/detail/detail-page";
import { ErrorState } from "@/components/states";
import { useConfirm } from "@/components/confirm-dialog";
import { ListTag } from "@/components/list-table";
import { JobStatus } from "@/components/owner/owner-parts";
import { timeLabel } from "@/components/maintenance/work-order-line-modal";
import { useFilePicker } from "@/components/maintenance/work-order-files";
import { WorkStatusIcon } from "@/components/maintenance/work-status-icon";
import { Button } from "@/components/ui/button";
import type { OwnerJob } from "@/types/api";

export const Route = createFileRoute("/_authed/me/jobs/$workOrderId")({
  component: OwnerJobPage,
});

const IMAGE = /\.(jpe?g|png|heic|heif|webp)$/i;
/** An answer the owner gave here themselves, and one the shop took on the phone (or a co-owner gave). */
const YOUR_ANSWER = { approved: "You approved", declined: "You declined", deferred: "Later" } as const;
const ANSWER = { approved: "Approved", declined: "Declined", deferred: "Later" } as const;

/**
 * A job as the owner sees it: where it stands, what the shop found and is waiting on an answer
 * for, what it has cost so far, the bill, and the photos the shop shared.
 */
function OwnerJobPage() {
  const { workOrderId } = Route.useParams();
  const id = Number(workOrderId);
  const q = useOwnerJob(Number.isFinite(id) ? id : null);
  const j = q.data;
  useDetailTitle(j?.label ?? null);

  if (q.isPending) return <CardSkeleton rows={6} />;
  const home = "/me";
  if (isMissingRecord(q.error) || (!q.isError && !j)) {
    return <RecordNotFound icon={PlaneTakeoff} title="Job not found" body="That link doesn't point at a job on your aircraft." backTo={home} backLabel="Back to Home" />;
  }
  if (q.isError || !j) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;

  const waiting = j.mayAnswer ? j.items.filter((i) => i.needsAnswer) : [];
  return (
    <div className="space-y-5">
      {j.ownsAircraft ? (
        <DetailBack to={`/me/aircraft/${j.aircraft.id}`} label={j.aircraft.tailNumber ?? "Aircraft"} />
      ) : (
        <DetailBack to={home} label="Home" />
      )}
      <DetailHeader
        title={j.label}
        subtitle={[j.aircraft.tailNumber, [j.aircraft.make, j.aircraft.model].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
        badges={<JobStatus job={j} />}
        meta={
          <>
            <MetaItem icon={CalendarClock}>Opened {formatDate(j.openedAt)}</MetaItem>
            {j.promisedOn && <MetaItem icon={CalendarClock}>Back by {format(parseISO(j.promisedOn), "MMM d, yyyy")}</MetaItem>}
            {j.completedAt && <MetaItem icon={CalendarClock}>Finished {formatDate(j.completedAt)}</MetaItem>}
            {waiting.length > 0 && (
              <button
                type="button"
                onClick={() => document.getElementById("work")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[12.5px] font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/60"
              >
                <MessageSquareWarning className="size-3.5" />
                {waiting.length === 1 ? "1 finding waits on your answer" : `${waiting.length} findings wait on your answer`}
              </button>
            )}
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          <OwnerWork job={j} />

          <OwnerFiles job={j} />
        </div>

        <div className="space-y-5">
          <DetailCard title="Charges so far" description={!j.billedToYou ? undefined : j.invoice ? undefined : "Before tax and fees. The invoice is the final word."}>
            {!j.billedToYou ? (
              <CardEmpty>This job is billed to another owner.</CardEmpty>
            ) : j.lines.length === 0 ? (
              <CardEmpty>Nothing charged yet.</CardEmpty>
            ) : (
              <table className="w-full text-[13px]" aria-label="Charges">
                <tbody>
                  {j.lines.map((l) => (
                    <tr key={l.id} className="border-b border-border last:border-0 align-top">
                      <td className="py-1.5 pr-3">
                        <p>{l.description}</p>
                        <p className="text-[12px] text-muted-foreground">
                          {l.kind}
                          {l.minutes != null ? `, ${timeLabel(l.minutes)}` : l.qty > 1 ? `, ${l.qty}` : ""}
                          {l.partStatus === "ordered" ? `, on order${l.expectedOn ? ` (expected ${format(parseISO(l.expectedOn), "MMM d")})` : ""}` : ""}
                        </p>
                      </td>
                      <td className="tnum py-1.5 text-right whitespace-nowrap">{formatMoney(l.totalCents)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="pt-2 font-medium">Total so far</td>
                    <td className="tnum pt-2 text-right font-medium">{formatMoney(j.chargesCents)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </DetailCard>

          {j.invoice && (
            <DetailCard title="Invoice">
              <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
                <span className="inline-flex items-center gap-2">
                  <Receipt className="size-4 text-muted-foreground" />
                  {j.invoice.number ? `Invoice ${j.invoice.number}` : "Invoice"}, {formatMoney(j.invoice.totalCents)}
                  <ListTag>{j.invoice.paid ? "Paid" : j.invoice.refunded ? "Refunded" : "Unpaid"}</ListTag>
                </span>
                <Button size="sm" variant={j.invoice.paid || j.invoice.refunded ? "outline" : "default"} asChild>
                  <Link to="/me/invoices" search={{ invoice: j.invoice.id }}>
                    {j.invoice.paid || j.invoice.refunded ? "View" : "View and pay"}
                  </Link>
                </Button>
              </div>
            </DetailCard>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The work on the job. Found items waiting on the owner's answer come first, in the list itself,
 * each with Approve, Decline and Later (Tony, 2026-10-01: a separate box above everything pushed
 * the page down when the shop found a lot). The rest follow with where each stands.
 */
function OwnerWork({ job }: { job: OwnerJob }) {
  const answer = useAnswerItems(job.id);
  const confirm = useConfirm();
  const [busy, setBusy] = React.useState<number | "all" | null>(null);
  // Any owner answers while the job is open and not invoiced. Once the shop closes it, what was
  // left unanswered shows read-only; once it bills it, the server reads the page as the bill and
  // nothing waits on an answer.
  const waiting = job.mayAnswer ? job.items.filter((i) => i.needsAnswer) : [];
  const elsewhere = job.mayAnswer ? [] : job.items.filter((i) => i.needsAnswer);
  const rest = job.items.filter((i) => !i.needsAnswer);
  // A finding waiting on an answer is not a charge yet: the server sends what it would cost as
  // the item's estimate, for the person billed only.
  const priceOf = (itemId: number) => job.items.find((i) => i.id === itemId)?.estimateCents ?? 0;

  // Arriving from "Review" on the home page: bring the list into view once it is drawn.
  React.useEffect(() => {
    if (window.location.hash === "#work") document.getElementById("work")?.scrollIntoView({ block: "start" });
  }, []);

  // Each answer names the send it answers (`askedAt`): a finding the shop reworded since is
  // refused, the page reads it again, and the owner answers what it says now.
  type Answer = { item: OwnerJob["items"][number]; decision: "approved" | "declined" | "deferred" };
  const send = async (answers: Answer[], key: number | "all") => {
    const decisions = answers.map(({ item, decision }) => ({ itemId: item.id, decision, askedAt: item.askedAt ?? null }));
    setBusy(key);
    try {
      await answer.mutateAsync(decisions);
      const d = decisions[0].decision;
      toast.success(
        decisions.length > 1
          ? `${decisions.length} approved. The shop will go ahead.`
          : d === "approved"
            ? "Approved. The shop will go ahead."
            : d === "declined"
              ? "Declined. The shop won't do it."
              : "Marked for later."
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send your answer");
    } finally {
      setBusy(null);
    }
  };
  const approveAll = async () => {
    const total = waiting.reduce((s, i) => s + priceOf(i.id), 0);
    const ok = await confirm({
      title: `Approve all ${waiting.length}?`,
      description: `${total > 0 ? `Estimated ${formatMoney(total)} before tax and fees. ` : ""}The shop goes ahead with every finding listed.`,
      confirmLabel: "Approve all",
    });
    if (ok) await send(waiting.map((item) => ({ item, decision: "approved" as const })), "all");
  };

  return (
    <div id="work" className="scroll-mt-4">
      <DetailCard title="The work" docShot="owner-the-work">
        {job.request && (
          <div className="mb-4">
            <p className="text-[12px] text-muted-foreground">What you asked for</p>
            <p className="text-[13px] whitespace-pre-wrap">{job.request}</p>
          </div>
        )}

        {waiting.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-lg border border-amber-300 dark:border-amber-800" data-doc-shot="owner-waiting-on-you">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 px-3.5 py-2.5 dark:bg-amber-950/40">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-amber-900 dark:text-amber-200">Waiting on your answer</p>
                <p className="text-[12px] text-amber-900/80 dark:text-amber-200/80">The shop found these while working on the aircraft. Say whether to go ahead.</p>
              </div>
              {waiting.length > 1 && (
                <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void approveAll()}>
                  {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : null} Approve all {waiting.length}
                </Button>
              )}
            </div>
            <ul className="divide-y divide-border" aria-label="Waiting on your answer">
              {waiting.map((i) => {
                const price = priceOf(i.id);
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-3">
                    <div className="flex min-w-0 flex-[1_1_16rem] items-start gap-2.5 text-[13px]">
                      <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                      <div className="min-w-0">
                        <p>{i.description}</p>
                        {price > 0 && <p className="text-[12px] text-muted-foreground">Estimated {formatMoney(price)}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <Button size="sm" variant="ghost" disabled={busy != null} onClick={() => void send([{ item: i, decision: "deferred" }], i.id)}>
                        Later
                      </Button>
                      <Button size="sm" variant="outline" disabled={busy != null} onClick={() => void send([{ item: i, decision: "declined" }], i.id)}>
                        Decline
                      </Button>
                      <Button size="sm" aria-label={`Approve: ${i.description}`} disabled={busy != null} onClick={() => void send([{ item: i, decision: "approved" }], i.id)}>
                        {busy === i.id ? <Loader2 className="size-4 animate-spin" /> : null} Approve
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {elsewhere.length > 0 && (
          <div className="mb-4 rounded-lg border border-border bg-muted/40 px-3.5 py-3">
            <p className="text-[13px] font-medium">Not answered</p>
            <p className="text-[12px] text-muted-foreground">
              The shop found {elsewhere.length === 1 ? "this" : "these"} while working on the aircraft, and closed the job before an answer. Call the shop about{" "}
              {elsewhere.length === 1 ? "it" : "them"}.
            </p>
            <ul className="mt-2 space-y-1.5" aria-label="Not answered">
              {elsewhere.map((i) => (
                <li key={i.id} className="flex items-start gap-2.5 text-[13px]">
                  <WorkStatusIcon status="todo" className="mt-0.5" />
                  {i.description}
                </li>
              ))}
            </ul>
          </div>
        )}

        {job.items.length === 0 ? (
          <CardEmpty>The shop hasn't listed the work yet.</CardEmpty>
        ) : rest.length > 0 ? (
          <ul className="divide-y divide-border" aria-label="Items">
            {rest.map((i) => (
              <li key={i.id} className="flex items-start gap-2.5 py-2.5 text-[13px] first:pt-0 last:pb-0">
                <WorkStatusIcon status={i.done ? "done" : i.decision === "declined" ? "declined" : i.decision === "deferred" ? "deferred" : i.decision === "approved" ? "approved" : "todo"} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p>{i.description}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <ListTag>{i.source === "found" ? "Found by the shop" : "You asked"}</ListTag>
                    {i.decision && i.source === "found" && <ListTag>{(i.answeredByYou ? YOUR_ANSWER : ANSWER)[i.decision]}</ListTag>}
                    {i.done && <ListTag>Done</ListTag>}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {job.notes && (
          <div className="mt-4 rounded-md bg-muted/50 px-3 py-2">
            <p className="text-[12px] text-muted-foreground">From the shop</p>
            <p className="text-[13px] whitespace-pre-wrap">{job.notes}</p>
          </div>
        )}
      </DetailCard>
    </div>
  );
}

/** Photos and documents the shop shared, and the owner's own. */
function OwnerFiles({ job }: { job: OwnerJob }) {
  const attach = useOwnerAttach(job.id);
  const picker = useFilePicker((files) => {
    if (files.length > 5) return void toast.error("Attach up to 5 files at a time.");
    attach.mutate(files, {
      onSuccess: ({ uploadError }) => (uploadError ? toast.error(`A file did not upload: ${uploadError}`) : toast.success(files.length === 1 ? `${files[0].name} attached` : `${files.length} files attached`)),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't attach those files"),
    });
  });
  return (
    <DetailCard
      title="Photos and documents"
      description="What the shop shared with you, and anything you add."
      action={
        <Button size="sm" variant="outline" onClick={picker.open} disabled={attach.isPending}>
          {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Attach
        </Button>
      }
    >
      {picker.input}
      {job.files.length === 0 ? (
        <CardEmpty>Nothing shared yet.</CardEmpty>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Files">
          {job.files.map((f) => (
            <li key={f.id} className="min-w-0 overflow-hidden rounded-lg border border-border">
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-muted/40" aria-label={`Open ${f.name}`}>
                {IMAGE.test(f.fileName) && f.url ? (
                  <img src={f.url} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex size-full items-center justify-center text-muted-foreground">{f.url ? <FileText className="size-5" /> : <ImageOff className="size-5" />}</span>
                )}
              </a>
              <p className="truncate p-2 text-[12px]" title={f.name}>
                {f.name}
              </p>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}
