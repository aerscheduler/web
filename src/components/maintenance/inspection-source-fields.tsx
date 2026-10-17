import { Input } from "@/components/ui/input";
import { DocsHint } from "@/components/docs-hint";
import { DatePickerField } from "@/components/date-picker";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as React from "react";
import { SOURCE_TYPE_LABELS } from "@/lib/maintenance";
import { normalizeAdNumber } from "@/lib/ad-number";
import { useAdLookup } from "@/features/queries";
import type { AirworthinessDirective, MaintenanceSourceType } from "@/types/api";

export type InspectionSource = {
  sourceType: MaintenanceSourceType | "";
  sourceRef: string;
  revision: string;
  /** ISO yyyy-mm-dd, or "". The date 14 CFR 91.417(a)(2)(v) actually asks for. */
  revisionDate: string;
  sourceUrl: string;
};

export const EMPTY_SOURCE: InspectionSource = {
  sourceType: "",
  sourceRef: "",
  revision: "",
  revisionDate: "",
  sourceUrl: "",
};

/** An AD with no number identifies nothing. The one required field in this block. */
export function sourceIsIncomplete(s: InspectionSource): boolean {
  return s.sourceType === "ad" && !s.sourceRef.trim();
}

/**
 * Where an inspection comes from: the AD or SB it implements, and which revision.
 *
 * SHARED BY ADD AND EDIT ON PURPOSE. An AD gets superseded, a school mistypes a number,
 * and the revision "currently in force" is by definition a thing that changes; an add-only
 * form would mean the only way to correct any of it was to delete the inspection and lose
 * its history. Two copies of these four fields would drift on the first change, so there
 * is one, the way the Flutter side already has one in maintenance_source_fields.dart.
 */
export function InspectionSourceFields({
  value,
  onChange,
  idPrefix = "insp",
  docShot,
  onAdFound,
}: {
  value: InspectionSource;
  onChange: (next: InspectionSource) => void;
  /** The AD number matched one in the library: the form may fill in a name of its own. */
  onAdFound?: (ad: AirworthinessDirective) => void;
  /** Ids must be unique when two of these can be mounted on one page. */
  idPrefix?: string;
  /** Set only on the instance the docs screenshot, so the shot is never ambiguous. */
  docShot?: string;
}) {
  const set = <K extends keyof InspectionSource>(key: K, v: InspectionSource[K]) =>
    onChange({ ...value, [key]: v });

  // An AD number that is in the library fills in the revision, its date and the link. Only
  // fields that are empty, or that still hold what an earlier look-up put there, change: a
  // value somebody typed is never overwritten. Change the number and the earlier AD's values
  // go with it, so the note under the field never credits one AD with another's dates.
  const adNumber = value.sourceType === "ad" ? normalizeAdNumber(value.sourceRef) : null;
  const lookup = useAdLookup(adNumber);
  const found = adNumber && lookup.data && lookup.data.adNumber === adNumber ? lookup.data : null;
  const filled = React.useRef<{ adNumber: string; revision: string; revisionDate: string; sourceUrl: string } | null>(null);
  React.useEffect(() => {
    const prev = filled.current;
    if (found ? prev?.adNumber === found.adNumber : !prev || prev.adNumber === adNumber) return;
    const next = found
      ? {
          adNumber: found.adNumber,
          revision: found.amendment ? `Amdt ${found.amendment}` : "",
          revisionDate: (found.effectiveOn ?? "").slice(0, 10),
          sourceUrl: found.url,
        }
      : null;
    const take = (key: "revision" | "revisionDate" | "sourceUrl") =>
      !value[key] || value[key] === prev?.[key] ? (next?.[key] ?? "") : value[key];
    filled.current = next;
    onChange({ ...value, revision: take("revision"), revisionDate: take("revisionDate"), sourceUrl: take("sourceUrl") });
    if (found) onAdFound?.(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found, adNumber, lookup.isFetching]);

  // A section, not a box: the forms holding it separate their sections with a rule, and a
  // bordered card inside a modal read as a second form. What each field means is in the info
  // popovers, not in paragraphs under every box.
  return (
    <div data-doc-shot={docShot} className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        Where this comes from
        <DocsHint topic="inspection-source" />
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-source-type`} className="text-xs">
            Source
          </Label>
          <Select
            value={value.sourceType || "none"}
            onValueChange={(v) =>
              set("sourceType", v === "none" ? "" : (v as MaintenanceSourceType))
            }
          >
            <SelectTrigger id={`${idPrefix}-source-type`} data-testid={`${idPrefix}-source-type`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Not specified</SelectItem>
              {(["ad", "sb", "manufacturer", "shop", "other"] as const).map((t) => (
                <SelectItem key={t} value={t}>
                  {SOURCE_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Revealed only once a source is chosen: otherwise every oil change grows four
            empty boxes for a question nobody asked. */}
        {value.sourceType && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-source-ref`} className="text-xs">
                Document number
                {value.sourceType === "ad" && <span className="text-destructive"> *</span>}
              </Label>
              <Input
                id={`${idPrefix}-source-ref`}
                value={value.sourceRef}
                onChange={(e) => set("sourceRef", e.target.value)}
                placeholder="2015-19-07"
                autoCapitalize="characters"
                autoCorrect="off"
                maxLength={32}
                aria-invalid={sourceIsIncomplete(value) || undefined}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-revision`} className="text-xs">
                Revision
              </Label>
              <Input
                id={`${idPrefix}-revision`}
                value={value.revision}
                onChange={(e) => set("revision", e.target.value)}
                placeholder="Amdt 39-23424"
                maxLength={16}
              />
            </div>
            {sourceIsIncomplete(value) && (
              <p className="text-xs text-destructive sm:col-span-3">
                An AD needs its number, or nothing can find it later.
              </p>
            )}
            {adNumber && (found || lookup.data === null) && (
              <AdLookupNote ad={found} className="sm:col-span-3" />
            )}
            {/* THE FIELD THE REGULATION NAMES. 14 CFR 91.417(a)(2)(v) asks for "the AD or safety
                directive number and revision date". We shipped only a free-text revision box
                placeholdered "2", so a school filling it in exactly as prompted did not have the
                thing the rule asks for. Its popover says so. */}
            <div className="space-y-1.5">
              <Label htmlFor={`${idPrefix}-revision-date`} className="inline-flex items-center gap-1.5 text-xs">
                Revision date
                <DocsHint topic="ad-revision-date" />
              </Label>
              <DatePickerField
                id={`${idPrefix}-revision-date`}
                value={value.revisionDate}
                onChange={(v) => set("revisionDate", v)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`${idPrefix}-source-url`} className="text-xs">
                Link
              </Label>
              <Input
                id={`${idPrefix}-source-url`}
                type="url"
                value={value.sourceUrl}
                onChange={(e) => set("sourceUrl", e.target.value)}
                placeholder="https://drs.faa.gov/…"
                maxLength={500}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * What the library knows about the AD number typed, under the field. Plain text, no box: the
 * note says where the filled-in values came from, or that this AD has to be entered by hand.
 */
function AdLookupNote({ ad, className }: { ad: AirworthinessDirective | null; className?: string }) {
  if (!ad) {
    return (
      <p className={`text-xs text-muted-foreground ${className ?? ""}`}>
        Not in the AD library, which has ADs published since 1995. Fill in the rest by hand.
      </p>
    );
  }
  const effective = ad.effectiveOn
    ? new Date(`${ad.effectiveOn.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
  return (
    <div className={`space-y-1 text-xs ${className ?? ""}`}>
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">AD {ad.adNumber}</span>, {ad.manufacturer}
        {effective ? `, effective ${effective}` : ""}. Filled in from the{" "}
        <a href={ad.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Federal Register
        </a>
        .
      </p>
      {ad.supersededBy && ad.supersededBy.length > 0 && (
        <p className="text-amber-700 dark:text-amber-400">
          Superseded by AD {ad.supersededBy.join(", AD ")}. Track the one in force.
        </p>
      )}
    </div>
  );
}
