import { useMemo, useState } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Resource, ResourceFile, ResourceFileCategory } from "@/types/api";
import {
  useCreateResourceFiles,
  useDeleteResourceFile,
  useResourceFiles,
  useUpdateResourceFile,
} from "@/features/queries";
import { useConfirm } from "@/components/confirm-dialog";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { AttachmentPreview } from "@/components/maintenance/squawk-attachments";
import { SquawkFileInput } from "@/components/maintenance/squawk-file-input";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const PAPER_CATEGORY_LABEL: Record<ResourceFileCategory, string> = {
  poh: "POH",
  weight_and_balance: "Weight and balance",
  insurance: "Insurance",
  form_337: "Form 337",
  logbook_scan: "Logbook",
  other: "Other",
};

function looksLikeMachineLabel(raw: string): boolean {
  let stem = raw.trim().replace(/\.[^.]+$/, "");
  if (!stem || stem.toLowerCase() === "file") return true;
  stem = stem.replace(/^(scaled[_\s-]+)+/i, "");
  if (!stem || stem.toLowerCase() === "file") return true;
  if (/^image[_\s-]?picker/i.test(stem)) return true;
  if (/^(IMG|DSC|PXL|MOV|VID|Screenshot)[-_\s]/i.test(stem)) return true;
  const compact = stem.replace(/[-_\s]/g, "");
  if (/^[0-9a-f]{32,}$/i.test(compact)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(stem);
}

function paperDisplayLabel(file: ResourceFile): string {
  const text = file.label?.trim() ?? "";
  if (text && !looksLikeMachineLabel(text)) return text;
  return PAPER_CATEGORY_LABEL[file.category];
}

const CATEGORY_ORDER: ResourceFileCategory[] = [
  "poh",
  "weight_and_balance",
  "insurance",
  "form_337",
  "logbook_scan",
  "other",
];

function PaperRow({
  file,
  canManage,
  resourceId,
}: {
  file: ResourceFile;
  canManage: boolean;
  resourceId: number;
}) {
  const confirm = useConfirm();
  const del = useDeleteResourceFile();
  const patch = useUpdateResourceFile();
  const href = file.fileUrls[0];
  const title = paperDisplayLabel(file);
  const category = PAPER_CATEGORY_LABEL[file.category];

  return (
    <li className="border-b border-border py-3 last:border-0">
      {href ? (
        <AttachmentPreview url={href} name={title} showCaption={false} />
      ) : null}
      <div className={`${href ? "mt-2 " : ""}flex items-start gap-3`}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {title !== category ? <span>{category}</span> : null}
            <Badge variant="outline" className="font-normal">
              {file.visibility === "bookers" ? "Bookers" : "Staff"}
            </Badge>
          </div>
        </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={async () => {
              const next = file.visibility === "bookers" ? "staff" : "bookers";
              if (next === "bookers") {
                const ok = await confirm({
                  title: "Show this to bookers?",
                  description:
                    "Anyone who can book this aircraft will be able to open the file.",
                  confirmLabel: "Make bookers",
                });
                if (!ok) return;
              }
              try {
                await patch.mutateAsync({
                  resourceId,
                  fileId: file.id,
                  visibility: next,
                });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not update that file.");
              }
            }}
          >
            {file.visibility === "bookers" ? "Make staff" : "Make bookers"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove paper"
            onClick={async () => {
              const ok = await confirm({
                title: "Remove this paper?",
                description: "Pilots will not see it on this aircraft afterwards. You can upload a replacement.",
                confirmLabel: "Remove",
                destructive: true,
              });
              if (!ok) return;
              try {
                await del.mutateAsync({ resourceId, fileId: file.id });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not remove that file.");
              }
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
      </div>
    </li>
  );
}

function AddPapersForm({
  resourceId,
  existing,
  onDone,
}: {
  resourceId: number;
  existing: ResourceFile[];
  onDone: () => void;
}) {
  const create = useCreateResourceFiles();
  const [category, setCategory] = useState<ResourceFileCategory>("poh");
  const [visibility, setVisibility] = useState<"bookers" | "staff">("bookers");
  const [label, setLabel] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const remaining = Math.max(0, 5 - existing.filter((f) => f.category === category).length);

  async function submit() {
    if (files.length === 0) {
      toast.error("Attach a photo or PDF.");
      return;
    }
    if (remaining === 0) {
      toast.error("This category already has 5 files. Remove one to add another.");
      return;
    }
    if (files.length > remaining) {
      toast.error(`You can attach up to ${remaining} files.`);
      return;
    }
    try {
      const result = await create.mutateAsync({
        resourceId,
        category,
        visibility,
        label: label.trim() || undefined,
        files,
      });
      if (result.uploadError) {
        toast.error(`Saved, but ${result.uploadError} Remove it and try again.`);
      } else {
        toast.success("Paper added.");
      }
      setFiles([]);
      setLabel("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add that paper.");
    }
  }

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border p-3" data-doc-shot="aircraft-papers-add">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="paper-category">Category</Label>
          <select
            id="paper-category"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={category}
            onChange={(e) => {
              const next = e.target.value as ResourceFileCategory;
              setCategory(next);
              if (next === "poh" || next === "weight_and_balance") setVisibility("bookers");
              else setVisibility("staff");
              const nextRemaining = Math.max(0, 5 - existing.filter((f) => f.category === next).length);
              setFiles((prev) => prev.slice(0, nextRemaining));
            }}
          >
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {PAPER_CATEGORY_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="paper-visibility">Who can open it</Label>
          <select
            id="paper-visibility"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as "bookers" | "staff")}
          >
            <option value="bookers">Bookers</option>
            <option value="staff">Staff only</option>
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="paper-label">Label (optional)</Label>
        <Input
          id="paper-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Current W&B"
        />
      </div>
      <SquawkFileInput
        files={files}
        onChange={setFiles}
        hint={false}
        max={remaining}
        onBusyChange={setFileBusy}
        helpText={
          remaining === 0
            ? "This category already has 5 files. Remove one to add another."
            : `Up to ${remaining} more photo${remaining === 1 ? "" : "s"} (jpg or png) or PDFs in this category. iPhone Camera and Photos work. You can replace a stale file later.`
        }
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void submit()} disabled={create.isPending || fileBusy}>
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={fileBusy}
          onClick={() => {
            setFiles([]);
            onDone();
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Papers locker on the aircraft page.
 */
export function ResourcePapers({
  resource,
  canManage,
}: {
  resource: Resource;
  canManage: boolean;
}) {
  const q = useResourceFiles(resource.id);
  const files = q.data ?? [];
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<ResourceFileCategory, ResourceFile[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const file of files) {
      const list = map.get(file.category) ?? [];
      list.push(file);
      map.set(file.category, list);
    }
    return CATEGORY_ORDER.filter((c) => (map.get(c)?.length ?? 0) > 0).map((c) => ({
      category: c,
      files: map.get(c)!,
    }));
  }, [files]);

  return (
    <DetailCard
      title={
        <span className="inline-flex items-center gap-1.5">
          Papers
          <DocsHint topic="aircraft-papers" />
        </span>
      }
      description="The current POH and weight and balance for this aircraft. Staff can replace a stale file."
      action={
        canManage && !adding ? (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> Add
          </Button>
        ) : undefined
      }
      docShot="aircraft-papers"
    >
      {canManage && adding ? (
        <AddPapersForm resourceId={resource.id} existing={files} onDone={() => setAdding(false)} />
      ) : null}
      {q.isLoading ? (
        <CardSkeleton />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : files.length === 0 && !adding ? (
        <CardEmpty>
          {canManage
            ? "Add the POH and the current weight and balance."
            : "The school has not added papers for this aircraft yet."}
        </CardEmpty>
      ) : (
        <ul className="divide-y-0">
          {grouped.map((group) => (
            <li key={group.category} className="mb-4 last:mb-0">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {PAPER_CATEGORY_LABEL[group.category]}
              </p>
              <ul>
                {group.files.map((file) => (
                  <PaperRow key={file.id} file={file} canManage={canManage} resourceId={resource.id} />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

/**
 * Non-blocking Papers control on the book form once an aircraft is chosen.
 */
export function ResourcePapersButton({ resourceId }: { resourceId: number | null }) {
  const q = useResourceFiles(resourceId);
  const [open, setOpen] = useState(false);
  const files = (q.data ?? []).filter((f) => f.visibility === "bookers");

  if (!resourceId) return null;
  if (q.isError && files.length === 0) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => void q.refetch()}>
        Papers unavailable. Retry
      </Button>
    );
  }
  if (files.length === 0) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setOpen(true);
          void q.refetch();
        }}
      >
        <FileText className="size-4" />
        Papers ({files.length})
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Aircraft papers</SheetTitle>
            <SheetDescription>POH and weight and balance for this tail. They do not block the booking.</SheetDescription>
          </SheetHeader>
          <ul className="mt-4">
            {files.map((file) => (
              <PaperRow key={file.id} file={file} canManage={false} resourceId={resourceId} />
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
