import { X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { DateRangePicker } from "@/components/billing/date-range-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type BooleanFacet = {
  kind: "boolean";
  key: string;
  label: string;
  trueLabel?: string;
  falseLabel?: string;
};

export type SelectFacet = {
  kind: "select";
  key: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  /** Placeholder when nothing selected. Default: `All`. Ignored when `required`. */
  allLabel?: string;
  /** When true, omit the "All" option — value is always one of `options`. */
  required?: boolean;
};

export type DateRangeFacet = {
  kind: "dateRange";
  key: "dateRange";
  label: string;
};

export type FacetDef = BooleanFacet | SelectFacet | DateRangeFacet;

export type ListFilterValues = {
  /** ISO start/end when a dateRange facet is present. */
  startDate?: string;
  endDate?: string;
  [key: string]: string | boolean | undefined;
};

function chipLabel(facet: FacetDef, values: ListFilterValues): string | null {
  if (facet.kind === "boolean") {
    const v = values[facet.key];
    if (v === true) return `${facet.label}: ${facet.trueLabel ?? "Yes"}`;
    if (v === false) return `${facet.label}: ${facet.falseLabel ?? "No"}`;
    return null;
  }
  if (facet.kind === "select") {
    const v = values[facet.key];
    if (v === undefined || v === "") return null;
    // Required facets with a default shouldn't chip the default first option.
    if (facet.required && String(v) === facet.options[0]?.value) return null;
    const opt = facet.options.find((o) => o.value === String(v));
    return `${facet.label}: ${opt?.label ?? String(v)}`;
  }
  if (facet.kind === "dateRange") {
    if (!values.startDate && !values.endDate) return null;
    return facet.label;
  }
  return null;
}

/**
 * Declarative facet controls for list pages. Renders selects / date range plus
 * dismissible chips for active filters.
 */
export function ListFilters({
  facets,
  values,
  onChange,
  className,
}: {
  facets: FacetDef[];
  values: ListFilterValues;
  onChange: (next: ListFilterValues) => void;
  className?: string;
}) {
  const chips = facets
    .map((f) => {
      const label = chipLabel(f, values);
      return label ? { key: f.key, label, facet: f } : null;
    })
    .filter(Boolean) as Array<{ key: string; label: string; facet: FacetDef }>;

  function clearFacet(facet: FacetDef) {
    if (facet.kind === "dateRange") {
      onChange({ ...values, startDate: undefined, endDate: undefined });
      return;
    }
    if (facet.kind === "select" && facet.required) {
      onChange({ ...values, [facet.key]: facet.options[0]?.value });
      return;
    }
    onChange({ ...values, [facet.key]: undefined });
  }

  function clearAll() {
    const next: ListFilterValues = { ...values };
    for (const f of facets) {
      if (f.kind === "dateRange") {
        next.startDate = undefined;
        next.endDate = undefined;
      } else if (f.kind === "select" && f.required) {
        next[f.key] = f.options[0]?.value;
      } else {
        next[f.key] = undefined;
      }
    }
    onChange(next);
  }

  const dateRange: DateRange | undefined =
    values.startDate || values.endDate
      ? {
          from: values.startDate ? new Date(values.startDate) : undefined,
          to: values.endDate ? new Date(values.endDate) : undefined,
        }
      : undefined;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {facets.map((facet) => {
          if (facet.kind === "boolean") {
            const current =
              values[facet.key] === true
                ? "true"
                : values[facet.key] === false
                  ? "false"
                  : "all";
            return (
              <Select
                key={facet.key}
                value={current}
                onValueChange={(v) =>
                  onChange({
                    ...values,
                    [facet.key]: v === "all" ? undefined : v === "true",
                  })
                }
              >
                <SelectTrigger size="sm" aria-label={facet.label}>
                  <SelectValue placeholder={facet.label} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{facet.label}: All</SelectItem>
                  <SelectItem value="true">{facet.trueLabel ?? "Yes"}</SelectItem>
                  <SelectItem value="false">{facet.falseLabel ?? "No"}</SelectItem>
                </SelectContent>
              </Select>
            );
          }
          if (facet.kind === "select") {
            const current =
              values[facet.key] !== undefined && values[facet.key] !== ""
                ? String(values[facet.key])
                : facet.required
                  ? (facet.options[0]?.value ?? "all")
                  : "all";
            return (
              <Select
                key={facet.key}
                value={current}
                onValueChange={(v) =>
                  onChange({
                    ...values,
                    [facet.key]:
                      !facet.required && v === "all" ? undefined : v,
                  })
                }
              >
                <SelectTrigger size="sm" aria-label={facet.label}>
                  <SelectValue placeholder={facet.allLabel ?? facet.label} />
                </SelectTrigger>
                <SelectContent>
                  {!facet.required && (
                    <SelectItem value="all">
                      {facet.allLabel ?? `All ${facet.label.toLowerCase()}`}
                    </SelectItem>
                  )}
                  {facet.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }
          return (
            <DateRangePicker
              key={facet.key}
              value={dateRange}
              onChange={(range) =>
                onChange({
                  ...values,
                  startDate: range?.from?.toISOString(),
                  endDate: range?.to?.toISOString(),
                })
              }
              className="h-8"
            />
          );
        })}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((c) => (
            <Badge key={c.key} variant="secondary" className="gap-1 pr-1">
              {c.label}
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label={`Clear ${c.label}`}
                onClick={() => clearFacet(c.facet)}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={clearAll}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}
