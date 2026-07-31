/**
 * Which columns a report shows.
 *
 * Order is the REPORT's order, not the order they were ticked — two people
 * looking at the same saved view must see the same table, and a picker that
 * preserved click order would give them different ones.
 */

import { Columns3, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ReportColumn } from "@/types/reports";

export function ColumnPicker({
  columns,
  selected,
  onChange,
}: {
  columns: ReportColumn[];
  /** Keys currently shown, already in report order. */
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const chosen = new Set(selected);
  const defaults = columns.filter((c) => c.default !== false).map((c) => c.key);
  const isDefault =
    selected.length === defaults.length && defaults.every((k) => chosen.has(k));

  const toggle = (key: string) => {
    const next = new Set(chosen);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // A table with no columns is not a state worth allowing.
    if (next.size === 0) return;
    onChange(columns.filter((c) => next.has(c.key)).map((c) => c.key));
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Columns3 className="size-4" />
          Columns
          {!isDefault && (
            <span className="rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary">
              {selected.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Columns</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={isDefault}
            onClick={() => onChange(defaults)}
          >
            <RotateCcw className="size-3" />
            Reset
          </Button>
        </div>
        <ScrollArea className="max-h-80">
          <div className="space-y-0.5 p-2">
            {columns.map((column) => (
              <label
                key={column.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={chosen.has(column.key)}
                  onCheckedChange={() => toggle(column.key)}
                />
                <span className="min-w-0">
                  <span className="block text-sm leading-tight">{column.label}</span>
                  {column.description && (
                    <span className="block text-xs leading-snug text-muted-foreground">
                      {column.description}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
