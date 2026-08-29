import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SOURCE_TYPE_LABELS } from "@/lib/maintenance";
import type { MaintenanceSourceType } from "@/types/api";

export type InspectionSource = {
  sourceType: MaintenanceSourceType | "";
  sourceRef: string;
  revision: string;
  sourceUrl: string;
};

export const EMPTY_SOURCE: InspectionSource = {
  sourceType: "",
  sourceRef: "",
  revision: "",
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
}: {
  value: InspectionSource;
  onChange: (next: InspectionSource) => void;
  /** Ids must be unique when two of these can be mounted on one page. */
  idPrefix?: string;
  /** Set only on the instance the docs screenshot, so the shot is never ambiguous. */
  docShot?: string;
}) {
  const set = <K extends keyof InspectionSource>(key: K, v: InspectionSource[K]) =>
    onChange({ ...value, [key]: v });

  return (
    <div
      data-doc-shot={docShot}
      className="space-y-3 rounded-lg border border-border p-3"
    >
      <div className="space-y-0.5">
        <Label htmlFor={`${idPrefix}-source-type`}>Where this comes from</Label>
        <p className="text-xs text-muted-foreground">
          Optional. An Airworthiness Directive is binding under 14 CFR Part 39; a Service
          Bulletin is the manufacturer&rsquo;s advice.
        </p>
      </div>

      <Select
        value={value.sourceType || "none"}
        onValueChange={(v) =>
          set("sourceType", v === "none" ? "" : (v as MaintenanceSourceType))
        }
      >
        <SelectTrigger id={`${idPrefix}-source-type`} data-testid={`${idPrefix}-source-type`}>
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

      {/* Revealed only once a source is chosen: otherwise every oil change grows three
          empty boxes for a question nobody asked. */}
      {value.sourceType && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-source-ref`}>
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
            />
            {sourceIsIncomplete(value) && (
              <p className="text-xs text-destructive">
                An AD needs its number, or nothing can find it later.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-revision`}>Revision</Label>
            <Input
              id={`${idPrefix}-revision`}
              value={value.revision}
              onChange={(e) => set("revision", e.target.value)}
              placeholder="2"
              maxLength={16}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`${idPrefix}-source-url`}>Link</Label>
            <Input
              id={`${idPrefix}-source-url`}
              type="url"
              value={value.sourceUrl}
              onChange={(e) => set("sourceUrl", e.target.value)}
              placeholder="https://drs.faa.gov/…"
              maxLength={500}
            />
          </div>
        </div>
      )}
    </div>
  );
}
