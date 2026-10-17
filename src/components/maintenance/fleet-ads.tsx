import * as React from "react";
import { Link } from "@tanstack/react-router";
import type { AircraftAdItem, FleetAds as FleetAdsData } from "@/types/api";
import { useAdLookup, useAdMode, useFleetAds, usePlanes } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { DetailPanel } from "@/components/detail-panel";
import { DocsHint } from "@/components/docs-hint";
import { EmptyState, ErrorState } from "@/components/states";
import { GroupByMenu, ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AD_REASON_LABEL,
  AD_SECTION_HEADING,
  AD_STATES,
  AdDecision,
  AdReading,
  adDay,
  adHeadline,
  matchLabel,
  matchWords,
  useAdDecider,
} from "@/components/maintenance/ad-review";

/**
 * MAINTENANCE > FLEET ADs: every aircraft's Airworthiness Directives in one nested list, the
 * same per-aircraft lists as each aircraft's ADs tab (AircraftAdService.fleet on the server).
 *
 * Grouped by aircraft (each aircraft, then To review / Applies / Not applicable), or by status
 * (each AD once, the aircraft it names beneath it): "what does N172TS owe" and "which of our
 * aircraft does AD 2020-25-12 touch" are the two questions, and each grouping answers one.
 * A row opens the AD beside the list; deciding works here exactly as on the aircraft.
 */

type Item = FleetAdsData["items"][number];
type Group = "aircraft" | "status";
const GROUPS: { value: Group; label: string }[] = [
  { value: "aircraft", label: "Aircraft" },
  { value: "status", label: "Status" },
];

const COLUMNS: ListTableColumn[] = [
  { id: "names", header: "Names", width: "11rem", narrow: "fold" },
  { id: "effective", header: "Effective", width: "7rem", narrow: "fold" },
  { id: "decided", header: "Decided", width: "9rem", narrow: "hide" },
];
const NARROW_AT = 760;

/** Every word somewhere in the AD's number, title, maker or subject, or the aircraft's tail. */
function matches(i: Item, tail: string, words: string[]): boolean {
  if (!words.length) return true;
  const hay = [i.ad.adNumber, i.ad.title, i.ad.subject, i.ad.manufacturer, i.tracked?.name, tail].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

const stateLabel = (s: Item["state"]) => AD_STATES.find((x) => x.id === s)!.label;

function decidedCell(i: AircraftAdItem) {
  return (
    <span className="text-muted-foreground">
      {i.review ? `${i.review.decidedBy?.name ?? "Someone"}, ${adDay(i.review.decidedAt)}` : i.tracked ? "By its inspection" : "Not yet"}
    </span>
  );
}

export function FleetAds({ q, resourceId }: { q?: string; resourceId?: number[] }) {
  const { roles } = useAuth();
  const mode = useAdMode();
  const catalogue = mode.data?.mode === "catalogue";
  const fleetQ = useFleetAds({ enabled: catalogue });
  const planesQ = usePlanes({ scope: "all" });
  const decider = useAdDecider((id) => planesQ.data?.find((p) => p.id === id));
  const [group, setGroup] = React.useState<Group>("aircraft");
  // What the panel shows: an AD, on one aircraft or (a status group's parent row) on all of them.
  const [open, setOpen] = React.useState<{ adNumber: string; resourceId: number | null } | null>(null);

  const data = fleetQ.data;
  const tails = React.useMemo(() => new Map((data?.aircraft ?? []).map((a) => [a.id, a.tailNumber])), [data]);
  const words = React.useMemo(() => (q ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean), [q]);
  const items = React.useMemo(
    () =>
      (data?.items ?? []).filter(
        (i) => (!resourceId?.length || resourceId.includes(i.resourceId)) && matches(i, tails.get(i.resourceId) ?? "", words)
      ),
    [data, resourceId, tails, words]
  );

  const target = React.useCallback((i: Item) => ({ resourceId: i.resourceId, tail: tails.get(i.resourceId) ?? "" }), [tails]);

  const groups = React.useMemo<ListTableGroup[]>(() => {
    const adRow = (i: Item, id: string, selected: boolean): ListTableRow => ({
      id,
      testId: `fleet-ad-${i.resourceId}-${i.ad.adNumber}`,
      label: `AD ${i.ad.adNumber}, ${adHeadline(i.ad, i.tracked)}`,
      title: (
        <>
          <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">AD {i.ad.adNumber}</span> <span>{adHeadline(i.ad, i.tracked)}</span>
        </>
      ),
      tags: i.review?.status === "not_applicable" && i.review.reason ? <ListTag>{AD_REASON_LABEL[i.review.reason]}</ListTag> : i.tracked ? <ListTag>Tracked</ListTag> : undefined,
      cells: {
        names: <span className="text-muted-foreground">{i.match ? matchWords(i.match) : "Not matched"}</span>,
        effective: <span className="text-muted-foreground">{adDay(i.ad.effectiveOn) ?? "Not known"}</span>,
        decided: decidedCell(i),
      },
      selected,
      onOpen: () => setOpen({ adNumber: i.ad.adNumber, resourceId: i.resourceId }),
      actions: decider.menu(i, target(i), true),
    });

    if (group === "aircraft") {
      return (data?.aircraft ?? [])
        .map((a) => {
          const mine = items.filter((i) => i.resourceId === a.id);
          return {
            id: `a-${a.id}`,
            label: (
              <span>
                <span className="font-medium">{a.tailNumber}</span>
                <span className="text-muted-foreground">
                  {[a.make, a.model].filter(Boolean).length ? ` ${[a.make, a.model].filter(Boolean).join(" ")}` : ""}
                  {a.inShop ? " (in the shop)" : ""}
                </span>
              </span>
            ),
            count: mine.length,
            rows: [],
            subgroups: AD_STATES.map((s) => {
              const rows = mine.filter((i) => i.state === s.id).map((i) => adRow(i, `${a.id}:${i.ad.adNumber}`, open?.resourceId === a.id && open.adNumber === i.ad.adNumber));
              return {
                id: `a-${a.id}-${s.id}`,
                label: s.label,
                marker: <span className="size-2 rounded-full" style={{ background: s.dot }} aria-hidden />,
                count: rows.length,
                rows,
              };
            }).filter((g) => g.rows.length > 0),
          };
        })
        .filter((g) => g.subgroups.length > 0);
    }

    // By status: each AD once under its state, the aircraft it names beneath it. An AD decided
    // differently on two aircraft shows under both states, each with its own aircraft.
    return AD_STATES.map((s) => {
      const inState = items.filter((i) => i.state === s.id);
      const byAd = new Map<string, Item[]>();
      for (const i of inState) byAd.set(i.ad.adNumber, [...(byAd.get(i.ad.adNumber) ?? []), i]);
      const rows: ListTableRow[] = [...byAd.entries()].map(([n, list]) => {
        const first = list[0];
        return {
          id: `${s.id}:${n}`,
          testId: `fleet-ad-${n}`,
          label: `AD ${n}, ${adHeadline(first.ad, first.tracked)}`,
          emphasis: true,
          title: (
            <>
              <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">AD {n}</span> <span>{adHeadline(first.ad, first.tracked)}</span>
            </>
          ),
          cells: {
            names: <span className="text-muted-foreground">{list.length === 1 ? tails.get(first.resourceId) : `${list.length} aircraft`}</span>,
            effective: <span className="text-muted-foreground">{adDay(first.ad.effectiveOn) ?? "Not known"}</span>,
          },
          selected: open?.adNumber === n && open.resourceId == null,
          onOpen: () => setOpen({ adNumber: n, resourceId: null }),
          children: list.map((i) => ({
            ...adRow(i, `${s.id}:${n}:${i.resourceId}`, open?.adNumber === n && open.resourceId === i.resourceId),
            title: <span className="font-medium">{tails.get(i.resourceId)}</span>,
            label: `${tails.get(i.resourceId)}, AD ${n}`,
          })),
        };
      });
      return {
        id: s.id,
        label: s.label,
        marker: <span className="size-2 rounded-full" style={{ background: s.dot }} aria-hidden />,
        count: byAd.size,
        rows,
      };
    }).filter((g) => g.rows.length > 0);
  }, [group, data, items, open, decider, target, tails]);

  if (mode.isLoading) return <ListTableSkeleton columns={COLUMNS} groups={2} rows={3} narrowAt={NARROW_AT} />;
  if (!catalogue) {
    return (
      <Card className="flex min-h-0 flex-1 flex-col">
        <EmptyState
          title="AerScheduler is not finding ADs for you"
          body={
            isAdmin(roles)
              ? "Choose Find them for me under Settings, Airworthiness Directives, and each aircraft's ADs are listed here for someone to decide. The AD library works either way."
              : "An owner or admin chooses Find them for me under Settings, Airworthiness Directives; then each aircraft's ADs are listed here. The AD library works either way."
          }
          docs="aircraft-ads"
          action={
            isAdmin(roles) ? (
              <Link to="/settings" search={{ tab: "ad-tracking" } as never} className="text-sm font-medium underline underline-offset-2">
                Open AD settings
              </Link>
            ) : undefined
          }
        />
      </Card>
    );
  }
  if (fleetQ.isLoading) return <ListTableSkeleton fill columns={COLUMNS} groups={3} rows={3} narrowAt={NARROW_AT} className="min-h-0 flex-1" />;
  if (fleetQ.isError || !data) return <ErrorState error={fleetQ.error} onRetry={() => void fleetQ.refetch()} />;

  const missing = data.aircraft.filter((a) => a.missing.includes("engine"));
  const openItems = open ? items.filter((i) => i.ad.adNumber === open.adNumber) : [];
  const openOne = open?.resourceId != null ? (openItems.find((i) => i.resourceId === open.resourceId) ?? null) : null;

  return (
    <div data-doc-shot="maintenance-fleet-ads" className="flex min-h-0 flex-1 flex-col pb-4">
      <ListTable
        label="Airworthiness Directives across the fleet"
        fill
        className="min-h-0"
        columns={COLUMNS}
        narrowAt={NARROW_AT}
        groups={groups}
        titleHeader="AD"
        showHeader
        childNoun="aircraft"
        toolbar={
          <div className="flex w-full items-center gap-2">
            <GroupByMenu value={group} options={GROUPS} onChange={setGroup} />
            <DocsHint topic="fleet-ads" side="bottom" align="start">
              {missing.length > 0 || !data.coverage.complete ? (
                <div className="space-y-1">
                  {missing.length > 0 && (
                    <p>
                      No engine recorded on {missing.map((a) => a.tailNumber).join(", ")}, so {missing.length === 1 ? "its" : "their"} engine ADs are not listed.
                    </p>
                  )}
                  {!data.coverage.complete && <p>The AD library is still loading ({data.coverage.count.toLocaleString()} so far).</p>}
                </div>
              ) : null}
            </DocsHint>
          </div>
        }
        empty={<p className="px-4 py-6 text-[13px] text-muted-foreground">{words.length || resourceId?.length ? "No ADs match that search." : "No ADs in the library name these aircraft."}</p>}
      />

      <FleetAdPanel
        adNumber={open?.adNumber ?? null}
        one={openOne}
        all={openItems}
        tails={tails}
        onOpenChange={(o) => !o && setOpen(null)}
        onPick={(resourceId) => open && setOpen({ adNumber: open.adNumber, resourceId })}
        menu={(i, compact) => decider.menu(i, target(i), compact)}
      />
      {decider.dialogs}
    </div>
  );
}

/**
 * One AD beside the fleet list. Opened on one aircraft: that aircraft's decision, and Decide in
 * the footer. Opened on the AD itself (a status group's parent row): every aircraft it names,
 * each with its own decision control.
 */
function FleetAdPanel({
  adNumber,
  one,
  all,
  tails,
  onOpenChange,
  onPick,
  menu,
}: {
  adNumber: string | null;
  one: Item | null;
  all: Item[];
  tails: Map<number, string>;
  onOpenChange: (open: boolean) => void;
  onPick: (resourceId: number) => void;
  menu: (i: Item, compact: boolean) => React.ReactNode;
}) {
  // The fleet list carries no AD text; the library look-up has it.
  const full = useAdLookup(adNumber);
  const first = one ?? all[0] ?? null;
  const highlight = one?.match && one.match.strength !== "range" ? one.match.token : null;
  return (
    <DetailPanel
      open={!!adNumber}
      onOpenChange={onOpenChange}
      title={adNumber ? `AD ${adNumber}` : "AD"}
      description={first ? adHeadline(first.ad, first.tracked) : undefined}
      badge={one ? <ListTag>{[tails.get(one.resourceId), one.match && matchLabel(one.match)].filter(Boolean).join(" \u00b7 ")}</ListTag> : undefined}
      footer={one ? menu(one, false) : undefined}
    >
      {adNumber && (
        <div className="space-y-5 pt-4" data-doc-shot="maintenance-fleet-ad-panel">
          {one ? (
            <AdDecision item={one} />
          ) : (
            <section className="space-y-1.5">
              <h3 className={AD_SECTION_HEADING}>On your aircraft</h3>
              <ul className="divide-y rounded-md border">
                {all.map((i) => (
                  <li key={i.resourceId} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onPick(i.resourceId)}>
                      <span className="font-medium">{tails.get(i.resourceId)}</span>{" "}
                      <span className="text-muted-foreground">
                        {stateLabel(i.state)}
                        {i.match ? `, ${matchWords(i.match)}` : ""}
                      </span>
                    </button>
                    {menu(i, true)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {full.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : full.data ? (
            <AdReading ad={{ ...full.data, details: full.data.details ?? null }} highlight={highlight} />
          ) : first ? (
            <AdReading ad={first.ad} />
          ) : null}
        </div>
      )}
    </DetailPanel>
  );
}
