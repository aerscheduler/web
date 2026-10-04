import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

/**
 * A record's properties changed where they are shown, like an issue's sidebar in Linear
 * (Tony, 2026-09-30): a label, a value that is quiet until hovered, and a click that opens a
 * small form for just that value. Enter saves (Cmd+Enter in a long one), Esc puts it back.
 * Shared by the owner's record and the aircraft's profile so they behave the same.
 */

export function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 py-0.5 text-[13px]">
      <span className="pt-1.5 text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export const propertyValueButton =
  "flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent";

export type PropertyField = {
  key: string;
  label: string;
  placeholder: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
  /** A paragraph rather than a line: a textarea, Cmd+Enter to save. */
  multiline?: boolean;
  maxLength?: number;
};

/**
 * One property, or a few edited together (an engine's model and serial). `values` are what is
 * stored; `shown` is how it reads at rest. `onSave` resolves true when the save stood.
 */
export function EditableProperty({
  label,
  shown,
  empty = "Not recorded",
  fields,
  values,
  editable,
  onSave,
}: {
  label: string;
  shown: React.ReactNode | null;
  empty?: string;
  fields: PropertyField[];
  values: Record<string, string | null>;
  editable: boolean;
  onSave: (next: Record<string, string | null>) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);
  const rest = shown != null && shown !== "" ? shown : <span className="text-muted-foreground">{empty}</span>;
  const id = (k: string) => `prop-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${k}`;

  if (!editable) {
    return (
      <PropertyRow label={label}>
        <span className="block min-h-8 py-1.5 [overflow-wrap:anywhere] whitespace-pre-line">{rest}</span>
      </PropertyRow>
    );
  }
  const missing = fields.some((f) => f.required && !(draft[f.key] ?? "").trim());
  const save = async () => {
    if (missing) return;
    const next: Record<string, string | null> = {};
    for (const f of fields) next[f.key] = (draft[f.key] ?? "").trim() || null;
    if (fields.every((f) => (next[f.key] ?? null) === (values[f.key] ?? null))) return setOpen(false);
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setOpen(false);
  };
  return (
    <PropertyRow label={label}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) setDraft(Object.fromEntries(fields.map((f) => [f.key, values[f.key] ?? ""])));
        }}
      >
        <PopoverTrigger asChild>
          <button type="button" className={cn(propertyValueButton, "items-start")} aria-label={`Change the ${label.toLowerCase()}`}>
            <span className="min-w-0 [overflow-wrap:anywhere] whitespace-pre-line">{rest}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          {fields.map((f, i) => (
            <div key={f.key} className="space-y-1.5">
              <label htmlFor={id(f.key)} className="text-[12px] font-medium">
                {f.label}
              </label>
              {f.multiline ? (
                <Textarea
                  id={id(f.key)}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      void save();
                    }
                  }}
                  placeholder={f.placeholder}
                  maxLength={f.maxLength}
                  rows={4}
                  autoFocus={i === 0}
                />
              ) : (
                <Input
                  id={id(f.key)}
                  value={draft[f.key] ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void save();
                    }
                  }}
                  placeholder={f.placeholder}
                  inputMode={f.inputMode}
                  maxLength={f.maxLength}
                  aria-invalid={f.required && !(draft[f.key] ?? "").trim()}
                  autoComplete="off"
                  autoFocus={i === 0}
                />
              )}
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || missing}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </PropertyRow>
  );
}

/** A property chosen from a few values, saved as it is picked. */
export function ChoiceProperty({
  label,
  value,
  options,
  editable,
  onSave,
}: {
  label: string;
  value: string | null;
  options: { value: string | null; label: string }[];
  editable: boolean;
  onSave: (next: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  if (!editable) {
    return (
      <PropertyRow label={label}>
        <span className="block min-h-8 py-1.5">{current?.label}</span>
      </PropertyRow>
    );
  }
  return (
    <PropertyRow label={label}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className={propertyValueButton} aria-label={`Change the ${label.toLowerCase()}`}>
            <span className={cn(value == null && "text-muted-foreground")}>{current?.label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          {options.map((o) => (
            <button
              key={o.value ?? "none"}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              className={cn("flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent", o.value === value && "font-medium")}
              onClick={async () => {
                setOpen(false);
                if (o.value !== value) await onSave(o.value);
              }}
            >
              {o.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </PropertyRow>
  );
}
