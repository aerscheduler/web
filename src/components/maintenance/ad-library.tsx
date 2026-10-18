import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import type { AdLibraryRow } from "@/types/api";
import { pageRows, useAdLibraryPage, useAdLookup, useAdMode, useFleetAds } from "@/features/queries";
import { usePaging } from "@/lib/paging";
import { DataTable } from "@/components/data-table";
import { DetailPanel } from "@/components/detail-panel";
import { DocsHint } from "@/components/docs-hint";
import { ErrorState, TableSkeleton } from "@/components/states";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AD_SECTION_HEADING, AD_STATES, AdReading, adDay, adHeadline, matchWords } from "@/components/maintenance/ad-review";

/**
 * MAINTENANCE > AD LIBRARY: every Airworthiness Directive in the library
 * (services/adLibrary.service.ts), searched and paged on the server. The page's
 * search box searches it: an AD number or its start ("2013-11"), or words, best match first
 * (the server's one library search, AdLibraryService.rank, the public website's too).
 *
 * Opening one reads it, and, when the organization finds ADs for its aircraft, says which of
 * them it names and where each stands, from the same fleet list as Fleet ADs.
 */

const TYPE_LABEL: Record<AdLibraryRow["productType"], string> = {
  airplane: "Airplane",
  rotorcraft: "Rotorcraft",
  engine: "Engine",
  propeller: "Propeller",
  glider: "Glider",
  balloon: "Balloon",
  appliance: "Appliance",
  various: "Various",
};
export const AD_PRODUCT_TYPES = Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }));

export function AdLibrary({ q, productType, openId, onOpenId }: { q?: string; productType?: string[]; openId: string | null; onOpenId: (adNumber: string | null) => void }) {
  const filter = { q: q || undefined, productType: productType?.length ? productType.join(",") : undefined };
  const paging = usePaging({ resetKey: filter });
  const listQ = useAdLibraryPage(filter, paging);
  const { rows, total } = pageRows(listQ);

  if (listQ.isLoading) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TableSkeleton rows={8} cols={5} />
      </Card>
    );
  }
  if (listQ.isError) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col">
        <ErrorState error={listQ.error} onRetry={() => void listQ.refetch()} />
      </Card>
    );
  }

  return (
    <div data-doc-shot="maintenance-ad-library" className="flex min-h-0 flex-1 flex-col pb-4">
      <p className="flex shrink-0 items-center gap-1.5 px-0.5 pb-2 text-xs text-muted-foreground">
        {total.toLocaleString()} AD{total === 1 ? "" : "s"}, {q ? "best match first" : "newest first"}.
        <DocsHint topic="ad-library" />
      </p>
      <DataTable
        fill
        columns={COLUMNS}
        data={rows}
        paging={paging}
        total={total}
        loading={listQ.isFetching}
        emptyMessage="No ADs match that search."
        docShot="maintenance-ad-library-table"
        onRowClick={(r) => onOpenId(r.adNumber)}
        isRowSelected={(r) => r.adNumber === openId}
        mobileCard={(r) => (
          <button type="button" onClick={() => onOpenId(r.adNumber)} className="w-full rounded-lg border border-border bg-card p-3 text-left">
            <div className="font-mono text-xs text-muted-foreground">AD {r.adNumber}</div>
            <div className="mt-0.5 text-sm font-medium">{adHeadline({ ...r, title: r.title })}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {r.manufacturer} · {adDay(r.effectiveOn ?? r.publishedOn)}
            </div>
          </button>
        )}
      />
      <LibraryAdPanel adNumber={openId} onOpenChange={(o) => !o && onOpenId(null)} />
    </div>
  );
}

const COLUMNS: ColumnDef<AdLibraryRow, unknown>[] = [
  {
    id: "adNumber",
    header: "AD",
    accessorFn: (r) => r.adNumber,
    cell: ({ getValue }) => <span className="font-mono text-[13px] whitespace-nowrap">{getValue() as string}</span>,
  },
  {
    id: "about",
    header: "About",
    accessorFn: (r) => adHeadline(r),
    cell: ({ row }) => (
      <div className="min-w-0 max-w-[28rem]">
        <div className="truncate text-sm">{adHeadline(row.original)}</div>
        <div className="truncate text-xs text-muted-foreground">{row.original.manufacturer}</div>
      </div>
    ),
  },
  {
    id: "type",
    header: "Type",
    accessorFn: (r) => TYPE_LABEL[r.productType],
    cell: ({ getValue }) => <span className="text-sm text-muted-foreground">{getValue() as string}</span>,
  },
  {
    id: "effective",
    header: "Effective",
    accessorFn: (r) => r.effectiveOn ?? r.publishedOn,
    cell: ({ getValue }) => <span className="tnum text-sm whitespace-nowrap">{adDay(getValue() as string)}</span>,
  },
];

/** One AD from the library, read in full, with where it stands on the organization's aircraft. */
function LibraryAdPanel({ adNumber, onOpenChange }: { adNumber: string | null; onOpenChange: (open: boolean) => void }) {
  const full = useAdLookup(adNumber);
  const mode = useAdMode();
  const fleet = useFleetAds({ enabled: !!adNumber && mode.data?.mode === "catalogue" });
  const tails = new Map((fleet.data?.aircraft ?? []).map((a) => [a.id, a.tailNumber]));
  const onFleet = (fleet.data?.items ?? []).filter((i) => i.ad.adNumber === adNumber);
  const ad = full.data;
  return (
    <DetailPanel
      open={!!adNumber}
      onOpenChange={onOpenChange}
      title={adNumber ? `AD ${adNumber}` : "AD"}
      description={ad ? adHeadline(ad) : undefined}
    >
      {adNumber && (
        <div className="space-y-5 pt-4" data-doc-shot="maintenance-ad-library-panel">
          {mode.data?.mode === "catalogue" && fleet.data && (
            <section className="space-y-1.5">
              <h3 className={AD_SECTION_HEADING}>On your aircraft</h3>
              {onFleet.length ? (
                <ul className="divide-y rounded-md border text-[13px]">
                  {onFleet.map((i) => (
                    <li key={i.resourceId} className="px-3 py-2">
                      <Link to="/aircraft/$resourceId" params={{ resourceId: String(i.resourceId) }} search={{ tab: "ads", ad: adNumber ?? undefined }} className="font-medium underline-offset-2 hover:underline">
                        {tails.get(i.resourceId)}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        {AD_STATES.find((s) => s.id === i.state)?.label}
                        {i.match ? `, ${matchWords(i.match)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  {ad?.supersededBy?.length
                    ? `None of your aircraft is listed against it: it was superseded by AD ${ad.supersededBy.join(", AD ")}, which is the one to review.`
                    : "It names none of your aircraft's makes and models."}
                </p>
              )}
            </section>
          )}
          {full.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : ad ? (
            <AdReading ad={{ ...ad, details: ad.details ?? null }} />
          ) : (
            <p className="text-[13px] text-muted-foreground">This AD is not in the library.</p>
          )}
        </div>
      )}
    </DetailPanel>
  );
}
