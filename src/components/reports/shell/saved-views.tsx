/**
 * Saved views.
 *
 * A saved view is a name plus the choices someone made — which is what turns
 * fourteen reports into as many as a school needs. "Month-end revenue", "Lapsed
 * students" and "Grounding squawks" are saved views, not code, and shared ones
 * are how a school standardises on one definition of a number instead of
 * everyone rebuilding it slightly differently.
 *
 * Only the author (or an admin) can overwrite one, enforced server-side; the UI
 * simply hides the controls it knows will 403.
 */

import { useState } from "react";
import { Bookmark, Check, Loader2, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/confirm-dialog";
import {
  useCreateSavedView,
  useDeleteSavedView,
  useSavedViews,
  useUpdateSavedView,
} from "@/features/reports";
import type { ReportConfig, ReportFilterDef, SavedReportView } from "@/types/reports";
import { describeFilters } from "./filter-builder";
import { cn } from "@/lib/utils";

export function SavedViews({
  reportId,
  filterDefs,
  config,
  activeViewId,
  onApply,
}: {
  reportId: string;
  filterDefs: ReportFilterDef[];
  /** The configuration currently on screen, saved as-is. */
  config: ReportConfig;
  activeViewId: number | null;
  onApply: (view: SavedReportView | null) => void;
}) {
  const views = useSavedViews(reportId);
  const create = useCreateSavedView();
  const update = useUpdateSavedView();
  const remove = useDeleteSavedView();

  const confirm = useConfirm();
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);

  const destroy = async (view: SavedReportView) => {
    const ok = await confirm({
      title: `Delete "${view.name}"?`,
      description: view.isShared
        ? "This view is shared, so it will disappear for everyone at the school."
        : "This cannot be undone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(view.id);
      if (view.id === activeViewId) onApply(null);
      toast.success("View deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not delete the view");
    }
  };

  const list = views.data ?? [];
  const active = list.find((v) => v.id === activeViewId) ?? null;

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const saved = await create.mutateAsync({ name: trimmed, reportId, config, isShared: shared });
      toast.success(`Saved "${saved.name}"`);
      setSaveOpen(false);
      setName("");
      setShared(false);
      onApply(saved);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save the view");
    }
  };

  const overwrite = async () => {
    if (!active) return;
    try {
      await update.mutateAsync({ id: active.id, config });
      toast.success(`Updated "${active.name}"`);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update the view");
    }
  };

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Bookmark className={cn("size-4", active && "fill-current")} />
              <span className="max-w-[10rem] truncate">{active ? active.name : "Saved views"}</span>
              {list.length > 0 && !active && (
                <span className="text-xs text-muted-foreground">{list.length}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-3 py-2 text-sm font-medium">Saved views</div>
            <ScrollArea className="max-h-80">
              <div className="p-1">
                {views.isLoading && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>
                )}
                {!views.isLoading && list.length === 0 && (
                  <p className="px-2 py-3 text-sm text-muted-foreground">
                    No saved views yet. Set the report up how you want it, then save it.
                  </p>
                )}
                {list.map((view) => (
                  <div
                    key={view.id}
                    className={cn(
                      "group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted",
                      view.id === activeViewId && "bg-muted"
                    )}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onApply(view)}
                    >
                      <span className="flex items-center gap-1.5">
                        {view.id === activeViewId && <Check className="size-3.5 shrink-0" />}
                        <span className="truncate text-sm">{view.name}</span>
                        {view.isShared && (
                          <Users
                            className="size-3 shrink-0 text-muted-foreground"
                            aria-label="Shared with the school"
                          />
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {describeFilters(filterDefs, view.config.filters ?? []) ||
                          (view.isShared && !view.isMine
                            ? `Shared by ${view.createdBy ?? "a colleague"}`
                            : "No filters")}
                      </span>
                    </button>
                    {view.isMine && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive"
                        onClick={() => destroy(view)}
                        aria-label={`Delete ${view.name}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            {active && (
              <div className="border-t border-border p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => onApply(null)}
                >
                  Clear selection
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Overwriting is separate from "Save as" so a shared view can't be
            redefined by accident while someone is exploring. */}
        {active?.isMine && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={overwrite}
            disabled={update.isPending}
          >
            {update.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            Update
          </Button>
        )}

        <Popover open={saveOpen} onOpenChange={setSaveOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Save className="size-4" />
              Save as
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="view-name">Name</Label>
              <Input
                id="view-name"
                value={name}
                maxLength={60}
                placeholder="Month-end revenue"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
            </div>
            <label className="flex items-start gap-2.5">
              <Switch checked={shared} onCheckedChange={setShared} />
              <span>
                <span className="block text-sm leading-tight">Share with the school</span>
                <span className="block text-xs leading-snug text-muted-foreground">
                  Everyone who can run this report sees it. Only you can change it.
                </span>
              </span>
            </label>
            <Button
              className="w-full"
              onClick={save}
              disabled={!name.trim() || create.isPending}
            >
              {create.isPending && <Loader2 className="size-4 animate-spin" />}
              Save view
            </Button>
          </PopoverContent>
        </Popover>
      </div>

    </>
  );
}
