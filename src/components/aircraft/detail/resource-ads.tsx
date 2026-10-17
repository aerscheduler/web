import * as React from "react";
import type { AircraftAdItem, Resource } from "@/types/api";
import { useAircraftAds } from "@/features/queries";
import { DetailPanel } from "@/components/detail-panel";
import { DocsHint } from "@/components/docs-hint";
import { ErrorState } from "@/components/states";
import { ListSearch } from "@/components/list-search";
import { ListTable, ListTableSkeleton, ListTag, type ListTableColumn, type ListTableGroup, type ListTableRow } from "@/components/list-table";
import { AD_REASON_LABEL, AD_STATES, AdDecision, AdReading, adDay, adHeadline, matchLabel, matchWords, useAdDecider } from "@/components/maintenance/ad-review";

/**
 * AIRWORTHINESS DIRECTIVES on the aircraft page (AD library, phase 2): the published ADs that
 * name this aircraft's airframe, engine or propeller, for somebody to decide. Owners, admins and
 * technicians, on an organization whose AD mode is "Find them for me" (catalogue).
 *
 * A ListTable like the aircraft's Work orders tab: grouped by what was decided, then by the part
 * the AD names. A row opens the AD in the detail panel, its applicability and required actions
 * laid out as the Federal Register meant (utils/adBlocks.ts on the server), with one Decide
 * action. A match is a reason to read an AD, never a ruling, so nothing is decided for anyone.
 */

type Part = "airframe" | "engine" | "propeller" | "other";

const STATES = AD_STATES;
const PARTS: { id: Part; label: string }[] = [
  { id: "airframe", label: "Airframe" },
  { id: "engine", label: "Engine" },
  { id: "propeller", label: "Propeller" },
  { id: "other", label: "Tracked by hand" },
];

const COLUMNS: ListTableColumn[] = [
  { id: "names", header: "Names", width: "11rem", narrow: "fold" },
  { id: "effective", header: "Effective", width: "7rem", narrow: "fold" },
  { id: "decided", header: "Decided", width: "9rem", narrow: "hide" },
];
const NARROW_AT = 760;

const partOf = (i: AircraftAdItem): Part => i.match?.on ?? "other";

/** A search over what a person would type: the number, the maker, the subject, the models. */
function matches(i: AircraftAdItem, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [i.ad.adNumber, i.ad.title, i.ad.subject, i.ad.manufacturer, i.ad.applicability, i.tracked?.name].filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function ResourceAds({ resource, onEditAircraft }: { resource: Resource; onEditAircraft?: () => void }) {
  const q = useAircraftAds(resource.id);
  const decider = useAdDecider(() => resource);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const data = q.data;
  const items = React.useMemo(() => (data?.items ?? []).filter((i) => matches(i, search)), [data, search]);
  // The order rows appear in, for stepping through them from the panel.
  const ordered = React.useMemo(() => {
    return STATES.flatMap((s) => PARTS.flatMap((p) => items.filter((i) => i.state === s.id && partOf(i) === p.id)));
  }, [items]);
  const open = ordered.find((i) => i.ad.adNumber === openId) ?? null;

  const tail = data?.aircraft.tailNumber ?? "";
  const actionsFor = React.useCallback(
    (item: AircraftAdItem, compact: boolean) => decider.menu(item, { resourceId: resource.id, tail }, compact),
    [decider, resource.id, tail]
  );

  const groups = React.useMemo<ListTableGroup[]>(() => {
    const row = (i: AircraftAdItem): ListTableRow => ({
      id: i.ad.adNumber,
      testId: `ad-${i.ad.adNumber}`,
      label: `AD ${i.ad.adNumber}, ${adHeadline(i.ad, i.tracked)}`,
      title: (
        <>
          <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">AD {i.ad.adNumber}</span>{" "}
          <span>{adHeadline(i.ad, i.tracked)}</span>
        </>
      ),
      tags:
        i.tracked || i.review?.reason || !i.ad.inLibrary ? (
          <>
            {i.tracked && <ListTag dot="var(--primary)">Tracked</ListTag>}
            {i.review?.status === "not_applicable" && i.review.reason && <ListTag>{AD_REASON_LABEL[i.review.reason]}</ListTag>}
            {!i.ad.inLibrary && <ListTag>Not in the library</ListTag>}
          </>
        ) : undefined,
      cells: {
        names: <span className="text-muted-foreground">{i.match ? matchWords(i.match) : "Not matched"}</span>,
        effective: <span className="text-muted-foreground">{adDay(i.ad.effectiveOn) ?? "Not known"}</span>,
        decided: (
          <span className="text-muted-foreground">
            {i.review ? `${i.review.decidedBy?.name ?? "Someone"}, ${adDay(i.review.decidedAt)}` : i.tracked ? "By its inspection" : "Not yet"}
          </span>
        ),
      },
      selected: openId === i.ad.adNumber,
      onOpen: () => setOpenId(i.ad.adNumber),
      actions: actionsFor(i, true),
    });
    return STATES.map((s) => {
      const inState = items.filter((i) => i.state === s.id);
      return {
        id: s.id,
        label: s.label,
        marker: <span className="size-2 rounded-full" style={{ background: s.dot }} aria-hidden />,
        count: inState.length,
        rows: [],
        subgroups: PARTS.map((p) => {
          const rows = inState.filter((i) => partOf(i) === p.id).map(row);
          return { id: `${s.id}-${p.id}`, label: p.label, count: rows.length, rows };
        }).filter((g) => g.rows.length > 0),
      };
    });
  }, [items, openId, actionsFor]);

  // One row: it stays put above the rows. What the list is, and what is missing for this
  // aircraft, are in the info button beside the search (Tony, 2026-10-16: no text block).
  const toolbar = (
    <div className="flex w-full items-center gap-2">
      <ListSearch value={search} onChange={setSearch} placeholder="Search number, maker, subject, model…" />
      <DocsHint topic="aircraft-ads" side="bottom" align="start">
        {data && (data.missing.length > 0 || !data.coverage.complete) ? (
          <MissingNotes missing={data.missing} coverage={data.coverage} onEditAircraft={onEditAircraft} />
        ) : null}
      </DocsHint>
    </div>
  );

  const step = (delta: -1 | 1) => {
    const at = ordered.findIndex((i) => i.ad.adNumber === openId);
    const next = ordered[at + delta];
    if (next) setOpenId(next.ad.adNumber);
  };

  return (
    // The list owns its scroll (the record page gives this tab a bounded column), so the search,
    // the column labels and the group headers stay put while the rows move.
    <div data-doc-shot="aircraft-ads" className="flex min-h-0 flex-1 flex-col pb-4">
      {q.isLoading ? (
        <ListTableSkeleton columns={COLUMNS} groups={2} rows={3} toolbar narrowAt={NARROW_AT} />
      ) : q.isError || !data ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : (
        <ListTable
          label="Airworthiness Directives for this aircraft"
          fill
          className="min-h-0"
          columns={COLUMNS}
          narrowAt={NARROW_AT}
          groups={groups}
          titleHeader="AD"
          showHeader
          toolbar={toolbar}
          childNoun="AD"
          empty={
            <p className="px-4 py-6 text-[13px] text-muted-foreground">
              {search.trim() ? "No ADs match that search." : "No ADs in the library name this aircraft\u2019s make and model."}
            </p>
          }
        />
      )}

      <AdPanel item={open} onOpenChange={(o) => !o && setOpenId(null)} onStep={step} actions={open ? actionsFor(open, false) : null} />

      {decider.dialogs}
    </div>
  );
}

function MissingNotes({
  missing,
  coverage,
  onEditAircraft,
}: {
  missing: ("engine" | "propeller" | "serialNumber")[];
  coverage: { count: number; complete: boolean };
  onEditAircraft?: () => void;
}) {
  const parts = missing.filter((m) => m !== "serialNumber");
  const lines: React.ReactNode[] = [];
  if (parts.length) {
    lines.push(
      <>
        No {parts.join(" or ")} recorded, so {parts.length > 1 ? "their" : "its"} ADs are not listed.
        {onEditAircraft && (
          <>
            {" "}
            <button type="button" onClick={onEditAircraft} className="text-foreground underline underline-offset-2">
              Edit aircraft
            </button>
          </>
        )}
      </>
    );
  }
  if (missing.includes("serialNumber")) lines.push(<>No serial number recorded, which most ADs need to be ruled out.</>);
  if (!coverage.complete) lines.push(<>The AD library is still loading ({coverage.count.toLocaleString()} so far).</>);
  if (!lines.length) return null;
  return (
    <div className="space-y-1">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

/** One AD, readable: the decision, what it applies to, what it requires. */
function AdPanel({
  item,
  onOpenChange,
  onStep,
  actions,
}: {
  item: AircraftAdItem | null;
  onOpenChange: (open: boolean) => void;
  onStep: (d: -1 | 1) => void;
  actions: React.ReactNode;
}) {
  const ad = item?.ad;
  const highlight = item?.match && item.match.strength !== "range" ? item.match.token : null;
  return (
    <DetailPanel
      open={!!item}
      onOpenChange={onOpenChange}
      onStep={onStep}
      title={ad ? `AD ${ad.adNumber}` : "AD"}
      description={item && ad ? adHeadline(ad, item.tracked) : undefined}
      badge={item?.match ? <ListTag>{matchLabel(item.match)}</ListTag> : undefined}
      footer={actions ?? undefined}
    >
      {item && ad && (
        <div className="space-y-5 pt-4" data-doc-shot="aircraft-ad-panel">
          <AdDecision item={item} />
          <AdReading ad={ad} highlight={highlight} />
        </div>
      )}
    </DetailPanel>
  );
}
