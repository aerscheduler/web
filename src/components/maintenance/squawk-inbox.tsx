import * as React from "react";
import { CheckCircle2, ClipboardList, Plus, Wrench } from "lucide-react";
import type { Squawk } from "@/types/api";
import { pageRows, useSquawk, useSquawksPage } from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { useAuth } from "@/lib/auth";
import { canResolveSquawk } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { InboxView, InboxPlaceholder } from "@/components/inbox-view";
import { TablePagination } from "@/components/table-pagination";
import { CardGridSkeleton, EmptyState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ResolveSquawkModal } from "@/components/maintenance/resolve-squawk-modal";
import { VerifySquawkModal } from "@/components/maintenance/verify-squawk-modal";
import { SquawkRecord, SquawkRow } from "@/components/maintenance/squawk-inbox-parts";

/**
 * The squawk queue, as an inbox.
 *
 * Open and Resolved are the same screen with a different `resolved` filter, so they are one
 * component: they differ only in how they sort, what an empty one says, and whether the
 * viewer is offered a Resolve button.
 *
 * Was a full-width list of cards that opened a right-hand drawer. A technician working
 * through a morning's squawks reads one, closes it, reads the next, and the drawer covered
 * the list it came from the whole time. Now the list stays and the write-up gets the rest of
 * the window, and moving to the next one is the down arrow.
 */
export function SquawkInbox({
  resolved,
  q: searchQ,
  resourceId,
  openId,
  onOpenId,
  toolbar,
  onLog,
}: {
  resolved: boolean;
  q?: string;
  resourceId?: number | number[];
  /** The open squawk, held in the URL so a link, a refresh and Back all work. */
  openId: number | null;
  onOpenId: (id: number | null) => void;
  toolbar?: React.ReactNode;
  /** Offered from the empty Open board. Absent on Resolved, where it would make no sense. */
  onLog?: () => void;
}) {
  const { roles } = useAuth();
  const canResolve = canResolveSquawk(roles);
  const filter = { resolved, q: searchQ, resourceId };
  const paging = usePaging({
    resetKey: filter,
    defaultSort: { key: resolved ? "resolvedAt" : "createdAt", dir: "desc" },
  });
  const listQ = useSquawksPage(filter, paging);
  const { rows: squawks, total } = pageRows(listQ);

  const [resolving, setResolving] = React.useState<Squawk | null>(null);
  const [verifying, setVerifying] = React.useState<Squawk | null>(null);

  // The open squawk may not be on this page of the list: a notification links straight to
  // one, and a filter can hide the very row somebody just came from. Fetched by id only
  // when the list does not already have it, so the ordinary click costs nothing extra.
  const onPage = squawks.some((s) => s.id === openId);
  const recordQ = useSquawk(openId != null && !onPage ? openId : null);

  const filtering = !!searchQ || hasResourceFilter(resourceId);
  const nothingAtAll = total === 0 && !filtering;

  return (
    <>
      <InboxView<Squawk>
        items={squawks}
        getItemKey={(s) => s.id}
        selectedKey={openId}
        onSelectKey={(key) => onOpenId(key == null ? null : Number(key))}
        selectedItem={openId != null && !onPage ? (recordQ.data ?? null) : undefined}
        renderItem={(s) => <SquawkRow squawk={s} />}
        renderDetail={(s) => (
          <SquawkRecord
            squawk={s}
            // Omitted for a dispatcher, who can read this board but whom the server will
            // not let close a squawk. Better no button than a 403 toast.
            onResolve={canResolve && !resolved ? setResolving : undefined}
            onVerify={canResolve ? setVerifying : undefined}
          />
        )}
        listLabel={resolved ? "Resolved squawks" : "Open squawks"}
        detailLabel="Squawk"
        toolbar={toolbar}
        listFooter={
          <TablePagination
            paging={paging}
            total={total}
            returned={squawks.length}
            loading={listQ.isFetching}
          />
        }
        loading={listQ.isLoading}
        listSkeleton={<CardGridSkeleton count={4} />}
        error={listQ.error}
        onRetry={() => listQ.refetch()}
        docShot={resolved ? "maintenance-squawks-resolved" : "maintenance-squawks-open"}
        className={cn(listQ.isFetching && "opacity-60")}
        empty={
          nothingAtAll ? (
            <Card className="min-h-0 flex-1 p-0">
              <EmptyState
                icon={resolved ? ClipboardList : CheckCircle2}
                title={resolved ? "Nothing resolved yet" : "No open squawks, the fleet's clean."}
                body={
                  resolved
                    ? "Squawks you sign off will be archived here for the record."
                    : "Anything a pilot reports shows up here until a technician signs it off."
                }
                action={
                  onLog ? (
                    <Button onClick={onLog}>
                      <Plus className="size-4" /> Log a squawk
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <Card className="min-h-0 flex-1 p-0">
              <EmptyState
                icon={ClipboardList}
                title="No matches"
                body="Nothing matches that search."
              />
            </Card>
          )
        }
        placeholder={
          <InboxPlaceholder
            icon={Wrench}
            title="Pick a squawk"
            body="Choose one on the left to read the write-up. Arrow keys move down the list."
          />
        }
      />

      <ResolveSquawkModal
        squawk={resolving}
        open={resolving != null}
        onOpenChange={(o) => !o && setResolving(null)}
      />

      <VerifySquawkModal
        squawk={verifying}
        open={verifying != null}
        onOpenChange={(o) => !o && setVerifying(null)}
      />
    </>
  );
}

function hasResourceFilter(resourceId?: number | number[]) {
  return Array.isArray(resourceId) ? resourceId.length > 0 : resourceId != null;
}
