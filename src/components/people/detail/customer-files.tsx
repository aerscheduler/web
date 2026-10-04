import * as React from "react";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, ImageOff, Loader2, MoreHorizontal, Paperclip, Trash2, UserRound } from "lucide-react";
import type { CustomerFile } from "@/types/api";
import { useAddCustomerFiles, useCustomerFiles, useRemoveCustomerFile, useUpdateCustomerFile } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";
import { DetailCard } from "@/components/detail/detail-page";
import { DocsHint } from "@/components/docs-hint";
import { ListTag } from "@/components/list-table";
import { useFilePicker } from "@/components/maintenance/work-order-files";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Files on a customer's account (Murray spec section 16): the signed work authorization, the
 * insurance certificate, a letter. The shop's own unless somebody shows one to the customer; a file
 * the customer added themselves is always theirs to see. For the people who run jobs (owners,
 * admins, technicians), like the customer details beside it. The demo refuses uploads, so it offers
 * none.
 */

const IMAGE = /\.(jpe?g|png|heic|heif)$/i;

export function CustomerFilesCard({ orgUserId }: { orgUserId: number }) {
  const { isDemo } = useAuth();
  const q = useCustomerFiles(orgUserId);
  const add = useAddCustomerFiles(orgUserId);
  const [visibility, setVisibility] = React.useState<"shop" | "owner">("shop");
  const upload = (files: File[]) => {
    if (files.length > 5) return void toast.error("Attach up to 5 files at a time.");
    add.mutate(
      { files, visibility },
      {
        onSuccess: ({ uploadError }) =>
          uploadError ? toast.error(`A file did not upload: ${uploadError}. Remove it and try again.`) : toast.success(files.length === 1 ? `${files[0].name} added` : `${files.length} files added`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add those files"),
      }
    );
  };
  const picker = useFilePicker(upload);
  const pick = (v: "shop" | "owner") => {
    setVisibility(v);
    picker.open();
  };
  const files = q.data ?? [];

  return (
    <DetailCard
      title={
        <span className="inline-flex items-center gap-1.5">
          Files
          <DocsHint topic="customer-files" />
        </span>
      }
      description="Signed authorizations, insurance, letters. The shop's own unless you show one to them; what they add themselves is theirs to see too."
      docShot="customer-files"
      action={
        isDemo ? undefined : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={add.isPending}>
                {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Add files
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => pick("shop")}>
                <EyeOff className="size-4" /> Keep to the shop
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => pick("owner")}>
                <Eye className="size-4" /> Show to the owner
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      {picker.input}
      {q.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : q.isError ? (
        <p className="text-[13px] text-muted-foreground">Couldn&apos;t load their files.</p>
      ) : files.length === 0 ? (
        isDemo ? (
          <p className="text-[13px] text-muted-foreground">No files on this account. Uploading is turned off in the demo.</p>
        ) : (
          <button
            type="button"
            onClick={() => pick("shop")}
            className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground transition-colors hover:border-foreground/35 hover:text-foreground"
          >
            <Paperclip className="size-4" />
            Add a signed authorization, their insurance, or a letter. Photos or PDFs.
          </button>
        )
      ) : (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Customer files">
          {files.map((f) => (
            <FileTile key={f.id} file={f} orgUserId={orgUserId} />
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

function FileTile({ file: f, orgUserId }: { file: CustomerFile; orgUserId: number }) {
  const update = useUpdateCustomerFile(orgUserId);
  const remove = useRemoveCustomerFile(orgUserId);
  const confirm = useConfirm();
  const [broken, setBroken] = React.useState(false);
  const name = f.label || f.fileName;
  const isImage = IMAGE.test(f.fileName);
  const change = (visibility: "shop" | "owner", done: string) =>
    update.mutate({ fileId: f.id, visibility }, { onSuccess: () => toast.success(done), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the file") });

  return (
    <li className="group/file relative min-w-0 overflow-hidden rounded-lg border border-border" data-testid={`customer-file-${f.id}`}>
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
          {f.fromCustomer ? (
            <ListTag>
              <UserRound className="size-3" /> From them
            </ListTag>
          ) : f.visibility === "owner" ? (
            <ListTag>Owner can see</ListTag>
          ) : null}
          <span className="text-[11px] text-muted-foreground">{formatDate(f.createdAt, "MMM d, yyyy")}</span>
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
        <DropdownMenuContent align="end" className="w-56">
          {/* What they added stays theirs to see: the server refuses hiding it, so it is not offered. */}
          {!f.fromCustomer &&
            (f.visibility === "shop" ? (
              <DropdownMenuItem onSelect={() => change("owner", "The owner can see it")}>
                <Eye className="size-4" /> Show to the owner
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => change("shop", "Kept to the shop")}>
                <EyeOff className="size-4" /> Keep to the shop
              </DropdownMenuItem>
            ))}
          {!f.fromCustomer && <DropdownMenuSeparator />}
          <DropdownMenuItem
            variant="destructive"
            onSelect={async () => {
              const ok = await confirm({
                title: `Remove ${name}?`,
                description: f.visibility === "owner" ? "It stops showing on their account, for them too." : "It stops showing on their account.",
                confirmLabel: "Remove",
                destructive: true,
              });
              if (!ok) return;
              remove.mutate(f.id, { onSuccess: () => toast.success("Removed"), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't remove it") });
            }}
          >
            <Trash2 className="size-4" /> Remove
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
