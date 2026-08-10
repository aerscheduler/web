import * as React from "react";
import { toast } from "sonner";
import { useCreateSquawk, usePlanes } from "@/features/queries";
import { resourceLabel, type Resource } from "@/types/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Combobox, type ComboOption } from "@/components/combobox";
import { DocsHint } from "@/components/docs-hint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

export function LogSquawkModal({
  open,
  onOpenChange,
  fixedResource,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Opened from one aircraft's page: the tail is decided by where you clicked,
   * so it's shown rather than asked for. Leaving the picker editable there would
   * let a squawk you filed from N12345's page land on a different tail.
   */
  fixedResource?: Resource | null;
}) {
  const planesQ = usePlanes({}, { enabled: open && !fixedResource });
  const create = useCreateSquawk();

  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [resourceId, setResourceId] = React.useState<string>("");
  const [grounding, setGrounding] = React.useState(false);

  // A fixed tail is the value, not a default the user could have edited away.
  const effectiveResourceId = fixedResource ? String(fixedResource.id) : resourceId;

  const options: ComboOption[] = React.useMemo(
    () =>
      (planesQ.data ?? []).map((r) => {
        const { name, kind } = resourceLabel(r);
        return { value: String(r.id), label: name, hint: kind };
      }),
    [planesQ.data]
  );

  function reset() {
    setTitle("");
    setDescription("");
    setResourceId("");
    setGrounding(false);
  }

  async function submit() {
    const trimmed = title.trim();
    //The server requires BOTH. Sending `description: undefined` came back "Description is
    //required."which read as the console being broken rather than the form being
    //incomplete, because nothing on screen had said the field was needed.
    const trimmedDescription = description.trim();
    if (!trimmed || !trimmedDescription) return;
    try {
      await create.mutateAsync({
        title: trimmed,
        description: trimmedDescription,
        resourceId: effectiveResourceId ? Number(effectiveResourceId) : undefined,
        grounding,
      });
      toast.success(grounding ? "Squawk logged, aircraft grounded." : "Squawk logged.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't log that squawk.");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Log a squawk"
      description="Report a discrepancy so the fleet stays airworthy."
    >
      <div data-doc-shot="log-squawk-modal" className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="squawk-title">Title</Label>
          <Input
            id="squawk-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Left brake soft"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="squawk-description">Description</Label>
          <Textarea
            id="squawk-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What did you notice, and when?"
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Aircraft</Label>
          {fixedResource ? (
            <div className="flex h-8 items-center rounded-md border border-border bg-muted/50 px-3 font-mono text-sm">
              {resourceLabel(fixedResource).name}
            </div>
          ) : (
            <Combobox
              options={options}
              value={resourceId}
              onChange={setResourceId}
              placeholder={planesQ.isLoading ? "Loading fleet…" : "Select an aircraft"}
              searchPlaceholder="Search tails…"
              emptyText="No aircraft found."
              disabled={planesQ.isLoading}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="squawk-grounding">Grounds the aircraft</Label>
              <DocsHint topic="squawk-grounding" />
            </div>
            <p className="text-xs text-muted-foreground">
              Marks this tail no-go until the squawk is resolved.
            </p>
          </div>
          <Switch id="squawk-grounding" checked={grounding} onCheckedChange={setGrounding} />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={!title.trim() || !description.trim() || create.isPending}
          >
            {create.isPending ? "Logging…" : "Log squawk"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
