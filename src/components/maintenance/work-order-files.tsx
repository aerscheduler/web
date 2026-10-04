import * as React from "react";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, ImageOff, Loader2, MoreHorizontal, Paperclip, Trash2 } from "lucide-react";
import type { WorkOrder, WorkOrderFile, WorkOrderItem } from "@/types/api";
import { useAttachWorkOrderFiles, useRemoveWorkOrderFile, useUpdateWorkOrderFile, useWorkOrderFiles, useWorkOrderItems } from "@/features/queries";
import { useConfirm } from "@/components/confirm-dialog";
import { DetailCard } from "@/components/detail/detail-page";
import { ListTag } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * A job's photos and documents (Murray spec sections 9, 15, 16): the crack on its finding, the
 * logbook entry, the 8130-3. The shop's own unless somebody shows one to the owner. Attached
 * here for the job, or from an item's menu for that item.
 */

const IMAGE = /\.(jpe?g|png|heic|heif)$/i;
export const FILE_ACCEPT = "image/jpeg,image/png,image/heic,image/heif,application/pdf,.heic,.heif";

/** Pick files with the browser's own dialog, then hand them on. One hidden input per caller. */
export function useFilePicker(onPick: (files: File[]) => void) {
  const ref = React.useRef<HTMLInputElement>(null);
  const input = (
    <input
      ref={ref}
      type="file"
      multiple
      accept={FILE_ACCEPT}
      className="hidden"
      data-testid="work-order-file-input"
      onChange={(e) => {
        const files = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (files.length) onPick(files);
      }}
    />
  );
  return { input, open: () => ref.current?.click() };
}

/** Upload, saying what happened: the rows exist before the bytes, so a failed upload is named. */
export function useAttach(workOrderId: number) {
  const attach = useAttachWorkOrderFiles(workOrderId);
  const run = async (files: File[], itemId: number | null = null) => {
    if (files.length > 5) {
      toast.error("Attach up to 5 files at a time.");
      return;
    }
    try {
      const { uploadError } = await attach.mutateAsync({ files, itemId });
      if (uploadError) toast.error(`A file did not upload: ${uploadError}. Remove it and try again.`);
      else toast.success(files.length === 1 ? `${files[0].name} attached` : `${files.length} files attached`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't attach those files");
    }
  };
  return { run, pending: attach.isPending };
}

export function WorkOrderFilesCard({ workOrder: w }: { workOrder: WorkOrder }) {
  const filesQ = useWorkOrderFiles(w.id);
  const itemsQ = useWorkOrderItems(w.id);
  const { run, pending } = useAttach(w.id);
  const picker = useFilePicker((files) => void run(files));
  const files = filesQ.data ?? [];
  const items = itemsQ.data ?? [];

  return (
    <DetailCard
      title="Files and photos"
      description="Photos, logbook entries and paperwork. The shop's own unless you show one to the owner."
      docShot="work-order-files"
      action={
        <Button size="sm" variant="outline" onClick={picker.open} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Attach
        </Button>
      }
    >
      {picker.input}
      {filesQ.isPending ? (
        <p className="text-[13px] text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <button
          type="button"
          onClick={picker.open}
          className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground"
        >
          <Paperclip className="size-4" />
          Attach photos or PDFs. A finding&apos;s photo goes on it from its menu.
        </button>
      ) : (
        <ul className="grid grid-cols-2 gap-2.5" aria-label="Files">
          {files.map((f) => (
            <FileTile key={f.id} file={f} workOrderId={w.id} items={items} />
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function FileTile({ file: f, workOrderId, items }: { file: WorkOrderFile; workOrderId: number; items: WorkOrderItem[] }) {
  const update = useUpdateWorkOrderFile(workOrderId);
  const remove = useRemoveWorkOrderFile(workOrderId);
  const confirm = useConfirm();
  const [broken, setBroken] = React.useState(false);
  const isImage = IMAGE.test(f.fileName);
  const name = f.label || f.fileName;
  const on = f.itemId != null ? items.find((i) => i.id === f.itemId) : null;
  const change = (patch: { visibility?: "shop" | "owner"; itemId?: number | null }, done: string) =>
    update.mutate(
      { fileId: f.id, ...patch },
      { onSuccess: () => toast.success(done), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the file") }
    );

  return (
    <li className="group/file relative min-w-0 overflow-hidden rounded-lg border border-border">
      <a href={f.url ?? undefined} target="_blank" rel="noreferrer" className="block aspect-[4/3] bg-muted/40" aria-label={`Open ${name}`}>
        {isImage && f.url && !broken ? (
          <img src={f.url} alt="" className="size-full object-cover" onError={() => setBroken(true)} loading="lazy" />
        ) : (
          <span className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
            {broken || !f.url ? <ImageOff className="size-5" /> : <FileText className="size-5" />}
            <span className="text-[11px]">{broken || !f.url ? "Not uploaded" : f.fileName.split(".").pop()?.toUpperCase()}</span>
          </span>
        )}
      </a>
      <div className="space-y-1 p-2">
        <p className="truncate text-[12px] font-medium" title={name}>
          {name}
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {f.visibility === "owner" && <ListTag>Owner can see</ListTag>}
          {on && (
            <span className="truncate text-[11px] text-muted-foreground" title={on.description}>
              On: {on.description}
            </span>
          )}
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="secondary"
            size="icon"
            className="absolute top-1.5 right-1.5 size-7 opacity-0 transition-opacity group-hover/file:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
            aria-label={`More for ${name}`}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {f.visibility === "shop" ? (
            <DropdownMenuItem onSelect={() => change({ visibility: "owner" }, "The owner can see it")}>
              <Eye className="size-4" /> Show to the owner
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => change({ visibility: "shop" }, "Kept to the shop")}>
              <EyeOff className="size-4" /> Keep to the shop
            </DropdownMenuItem>
          )}
          {items.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Paperclip className="size-4" /> Put it on…
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-w-[min(20rem,calc(100vw-2rem))]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">The job, or one of its items</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={f.itemId == null ? "job" : String(f.itemId)}
                  onValueChange={(v) => change({ itemId: v === "job" ? null : Number(v) }, "Moved")}
                >
                  <DropdownMenuRadioItem value="job">The job itself</DropdownMenuRadioItem>
                  {items.map((i) => (
                    <DropdownMenuRadioItem key={i.id} value={String(i.id)}>
                      <span className="line-clamp-2">{i.description}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              const ok = await confirm({ title: `Remove ${name}?`, description: "It stops showing on this job.", confirmLabel: "Remove", destructive: true });
              if (!ok) return;
              remove.mutate(f.id, {
                onSuccess: () => toast.success("Removed"),
                onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't remove it"),
              });
            }}
          >
            <Trash2 className="size-4" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
