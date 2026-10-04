import { useNavigate } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { FileText, History, Loader2, Paperclip, Trash2 } from "lucide-react";
import type { AircraftHistoryEntry, OwnerPaper } from "@/types/api";
import { pageRows, useAddOwnFiles, useOwnerAircraftHistoryPage, useOwnFiles, useRemoveOwnFile } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { usePaging } from "@/lib/paging";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { CardEmpty, CardSkeleton, DetailCard } from "@/components/detail/detail-page";
import { DataTable } from "@/components/data-table";
import { HistoryWhat, tenths } from "@/components/aircraft/detail/resource-history";
import { useFilePicker } from "@/components/maintenance/work-order-files";
import { Button } from "@/components/ui/button";
import { ListTag } from "@/components/list-table";

/**
 * The owner's side of section 16 and 17 (Murray spec): the documents on their account (what the
 * shop shows them, and what they add themselves), an aircraft's papers the shop shows them, and
 * what has been done to their aircraft. The demo refuses uploads, so it offers none.
 */

/** The documents on the owner's own account. */
export function YourDocumentsCard() {
  const { isDemo } = useAuth();
  const q = useOwnFiles();
  const add = useAddOwnFiles();
  const remove = useRemoveOwnFile();
  const confirm = useConfirm();
  const picker = useFilePicker((files) => {
    if (files.length > 5) return void toast.error("Add up to 5 files at a time.");
    add.mutate(files, {
      onSuccess: ({ uploadError }) => (uploadError ? toast.error(`A file did not upload: ${uploadError}`) : toast.success(files.length === 1 ? `${files[0].name} added` : `${files.length} files added`)),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add those files"),
    });
  });
  const files = q.data ?? [];
  return (
    <DetailCard
      title="Your documents"
      description={isDemo ? "What the shop shared with you." : "What the shop shared with you, and documents you add for the shop, like your insurance."}
      docShot="owner-documents"
      action={
        isDemo ? undefined : (
          <Button size="sm" variant="outline" onClick={picker.open} disabled={add.isPending}>
            {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Add
          </Button>
        )
      }
    >
      {picker.input}
      {q.isPending ? (
        <CardSkeleton rows={2} />
      ) : files.length === 0 ? (
        <CardEmpty>{isDemo ? "Nothing shared yet." : "Nothing here yet. Add your insurance or registration and the shop will have it."}</CardEmpty>
      ) : (
        <ul className="divide-y divide-border" aria-label="Your documents">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] underline-offset-2 hover:underline">
                {f.name}
              </a>
              {f.yours ? <ListTag>Yours</ListTag> : <ListTag>From the shop</ListTag>}
              <span className="text-[12px] text-muted-foreground">{formatDate(f.createdAt, "MMM d")}</span>
              {f.yours && !isDemo && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${f.name}`}
                  onClick={async () => {
                    const ok = await confirm({ title: `Remove ${f.name}?`, description: "The shop will no longer see it.", confirmLabel: "Remove", destructive: true });
                    if (!ok) return;
                    remove.mutate(f.id, { onSuccess: () => toast.success("Removed"), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't remove it") });
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

/** The aircraft's papers the shop shows its owners. Nothing at all when there are none. */
export function OwnerPapersCard({ papers }: { papers: OwnerPaper[] | undefined }) {
  if (!papers?.length) return null;
  return (
    <DetailCard title="Papers" description="What the shop keeps for this aircraft and shares with you.">
      <ul className="divide-y divide-border" aria-label="Papers">
        {papers.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-2 first:pt-0 last:pb-0">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <a href={p.url ?? undefined} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-[13px] underline-offset-2 hover:underline">
              {p.name}
            </a>
            <span className="text-[12px] text-muted-foreground">{formatDate(p.createdAt, "MMM d, yyyy")}</span>
          </li>
        ))}
      </ul>
    </DetailCard>
  );
}

const historyColumns: ColumnDef<AircraftHistoryEntry, unknown>[] = [
  {
    id: "date",
    meta: { sortKey: "date" },
    header: "Date",
    cell: ({ row }) => <span className="tnum whitespace-nowrap text-[13px] text-muted-foreground">{formatDate(row.original.date)}</span>,
  },
  { id: "what", header: "What", cell: ({ row }) => <HistoryWhat row={row.original} /> },
  {
    id: "by",
    header: "Signed by",
    cell: ({ row }) => <span className="text-[13px]">{row.original.by ?? <span className="text-muted-foreground">The shop</span>}</span>,
  },
  {
    id: "hobbs",
    header: "Hobbs",
    meta: { numeric: true },
    cell: ({ row }) => <div className="tnum text-right text-[13px]">{tenths(row.original.hobbs)}</div>,
  },
];

/** What has been done to one of the owner's aircraft: sign-offs and finished jobs, paged. */
export function OwnerHistoryCard({ resourceId }: { resourceId: number }) {
  const navigate = useNavigate();
  const paging = usePaging({ defaultSort: { key: "date", dir: "desc" } });
  const q = useOwnerAircraftHistoryPage(resourceId, paging);
  const { rows, total } = pageRows(q);
  const open = (r: AircraftHistoryEntry) => {
    if (r.link.workOrderId) void navigate({ to: "/me/jobs/$workOrderId", params: { workOrderId: String(r.link.workOrderId) } });
  };
  return (
    <DetailCard title="History" description="Inspections signed off and work the shop finished, newest first." docShot="owner-history">
      {q.isPending ? (
        <CardSkeleton rows={3} />
      ) : total === 0 ? (
        <CardEmpty>
          <span className="inline-flex items-center gap-1.5">
            <History className="size-4" /> Nothing recorded yet.
          </span>
        </CardEmpty>
      ) : (
        <div data-testid="owner-history">
          <DataTable
            columns={historyColumns}
            data={rows}
            paging={paging}
            total={total}
            loading={q.isFetching}
            onRowClick={open}
            emptyMessage="Nothing recorded yet."
            mobileCard={(r) => (
              <div className="rounded-lg border p-3" onClick={() => open(r)}>
                <div className="mb-1 text-[12px] text-muted-foreground">{formatDate(r.date)}</div>
                <HistoryWhat row={r} />
              </div>
            )}
          />
        </div>
      )}
    </DetailCard>
  );
}
