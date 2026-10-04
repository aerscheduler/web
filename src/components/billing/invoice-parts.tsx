import * as React from "react";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, ImageOff, Loader2, MoreHorizontal, Paperclip, Trash2, Wrench } from "lucide-react";
import type { Invoice, InvoiceBillTo, InvoiceFile } from "@/types/api";
import {
  useAddInvoiceFilesFromJob,
  useAttachInvoiceFiles,
  useInvoiceFiles,
  useRemoveInvoiceFile,
  useUpdateInvoiceFile,
} from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { formatPhone } from "@/lib/phone";
import { paymentSummary } from "@/lib/payment-methods";
import { useTimeZone } from "@/lib/use-timezone";
import { useConfirm } from "@/components/confirm-dialog";
import { useFilePicker } from "@/components/maintenance/work-order-files";
import { ListTag } from "@/components/list-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** The small uppercase heading every section of the invoice panels uses. */
export function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 items-center justify-between gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{children}</h3>
      {action}
    </div>
  );
}

/**
 * Who the bill is to, as it prints (Murray spec section 13): name, billing address, phone, email.
 * The server sends it to admins and to the person billed, and to nobody else.
 */
export function BillToSection({ billTo }: { billTo: InvoiceBillTo | null | undefined }) {
  if (!billTo || (!billTo.name && !billTo.email && !billTo.phone && !billTo.billingAddress)) return null;
  const phone = billTo.phone ? formatPhone(billTo.phone, billTo.phoneCountry) || billTo.phone : null;
  return (
    <section data-testid="invoice-bill-to">
      <SectionHeading>Bill to</SectionHeading>
      <address className="space-y-0.5 rounded-lg border p-3 text-sm not-italic">
        {billTo.name && <div className="font-medium">{billTo.name}</div>}
        {billTo.billingAddress && <div className="whitespace-pre-line text-muted-foreground">{billTo.billingAddress}</div>}
        {phone && (
          <div>
            <a href={`tel:${billTo.phone}`} className="text-muted-foreground hover:underline">
              {phone}
            </a>
          </div>
        )}
        {billTo.email && (
          <div className="min-w-0 truncate">
            <a href={`mailto:${billTo.email}`} className="text-muted-foreground hover:underline">
              {billTo.email}
            </a>
          </div>
        )}
      </address>
    </section>
  );
}

/**
 * How a paid bill was paid: "Paid by check #1234 on Oct 3". `staff` adds who recorded it and the
 * desk's note, which the person billed never sees.
 */
export function PaymentSummary({ invoice, staff = false }: { invoice: Invoice; staff?: boolean }) {
  const { orgZone, zone } = useTimeZone();
  const tz = orgZone ?? zone;
  const line = paymentSummary(invoice, (iso) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" }).format(new Date(iso))
  );
  if (!line) return null;
  const recordedBy = staff ? invoice.markedAsPaidBy?.user?.name ?? null : null;
  return (
    <div className="space-y-0.5 text-sm" data-testid="invoice-payment-summary">
      <div className="font-medium">{line}</div>
      {recordedBy && <div className="text-xs text-muted-foreground">Recorded by {recordedBy}</div>}
      {staff && invoice.paymentNote && <div className="text-xs whitespace-pre-line text-muted-foreground">{invoice.paymentNote}</div>}
    </div>
  );
}

const IMAGE = /\.(jpe?g|png|heic|heif)$/i;

/** Who a shared file is for, in the words of this kind of bill. */
function partyWords(invoice: Pick<Invoice, "purpose" | "workOrder">) {
  const shop = invoice.purpose === "work_order" || invoice.workOrder != null;
  return shop
    ? { show: "Show to the owner", keep: "Keep to the shop", tag: "Owner can see", shown: "The owner can see it", kept: "Kept to the shop" }
    : { show: "Show to the member", keep: "Keep it internal", tag: "Member can see", shown: "The member can see it", kept: "Kept internal" };
}

function FileRow({ file, children }: { file: InvoiceFile; children?: React.ReactNode }) {
  const name = file.label || file.fileName;
  return (
    <li className="flex min-w-0 items-center gap-2.5 rounded-lg border p-2">
      <a
        href={file.url ?? undefined}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-2.5 text-sm hover:underline"
        aria-label={`Open ${name}`}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {!file.url ? <ImageOff className="size-4" /> : IMAGE.test(file.fileName) ? <Paperclip className="size-4" /> : <FileText className="size-4" />}
        </span>
        <span className="min-w-0 truncate" title={name}>
          {name}
        </span>
      </a>
      {children}
    </li>
  );
}

/**
 * Files on the bill for the staff who manage invoices (admins): attach, show to the person billed
 * or keep internal, remove, and on a job's bill "Add from the job". The demo offers no attach:
 * uploads are refused there (403 DEMO_BLOCKED), so it shows what is there and nothing that fails.
 */
export function InvoiceFilesStaff({ invoice }: { invoice: Invoice }) {
  const { isDemo } = useAuth();
  const filesQ = useInvoiceFiles(invoice.id);
  const attach = useAttachInvoiceFiles(invoice.id);
  const fromJob = useAddInvoiceFilesFromJob(invoice.id);
  const words = partyWords(invoice);
  const picker = useFilePicker((files) => {
    if (files.length > 5) return void toast.error("Attach up to 5 files at a time.");
    attach.mutate(
      { files },
      {
        onSuccess: ({ uploadError }) =>
          uploadError
            ? toast.error(`A file did not upload: ${uploadError}. Remove it and try again.`)
            : toast.success(files.length === 1 ? `${files[0].name} attached` : `${files.length} files attached`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't attach those files"),
      }
    );
  });
  const files = filesQ.data ?? [];

  return (
    <section data-testid="invoice-files">
      <SectionHeading
        action={
          isDemo ? undefined : (
            <div className="flex items-center gap-1">
              {invoice.workOrder && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={fromJob.isPending}
                  onClick={() =>
                    fromJob.mutate(undefined, {
                      onSuccess: (added) =>
                        toast.success(
                          added.length === 0
                            ? "Every file on the job is already here"
                            : added.length === 1
                              ? "1 file added from the job"
                              : `${added.length} files added from the job`
                        ),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't add the job's files"),
                    })
                  }
                >
                  {fromJob.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wrench className="size-4" />} Add from the job
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={picker.open} disabled={attach.isPending}>
                {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />} Attach
              </Button>
            </div>
          )
        }
      >
        Files
      </SectionHeading>
      {picker.input}
      {filesQ.isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isDemo ? "No files on this invoice." : "A vendor's invoice, a receipt or an 8130-3. Kept internal unless you show one."}
        </p>
      ) : (
        <ul className="space-y-1.5" aria-label="Invoice files">
          {files.map((f) => (
            <StaffFile key={f.id} file={f} invoiceId={invoice.id} words={words} readOnly={isDemo} />
          ))}
        </ul>
      )}
    </section>
  );
}

function StaffFile({
  file: f,
  invoiceId,
  words,
  readOnly,
}: {
  file: InvoiceFile;
  invoiceId: number;
  words: ReturnType<typeof partyWords>;
  readOnly: boolean;
}) {
  const update = useUpdateInvoiceFile(invoiceId);
  const remove = useRemoveInvoiceFile(invoiceId);
  const confirm = useConfirm();
  const name = f.label || f.fileName;
  const change = (visibility: "shop" | "owner", done: string) =>
    update.mutate(
      { fileId: f.id, visibility },
      { onSuccess: () => toast.success(done), onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the file") }
    );
  return (
    <FileRow file={f}>
      {f.visibility === "owner" && <ListTag>{words.tag}</ListTag>}
      {f.workOrderFileId != null && <span className="shrink-0 text-xs text-muted-foreground">From the job</span>}
      {!readOnly && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" aria-label={`More for ${name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {f.visibility === "shop" ? (
              <DropdownMenuItem onSelect={() => change("owner", words.shown)}>
                <Eye className="size-4" /> {words.show}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => change("shop", words.kept)}>
                <EyeOff className="size-4" /> {words.keep}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={async () => {
                const ok = await confirm({ title: `Remove ${name}?`, description: "It stops showing on this invoice.", confirmLabel: "Remove", destructive: true });
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
      )}
    </FileRow>
  );
}

/** The files the organization shared on the bill, for the person billed. Nothing when none. */
export function InvoiceFilesShared({ invoiceId }: { invoiceId: number }) {
  const filesQ = useInvoiceFiles(invoiceId);
  const files = filesQ.data ?? [];
  if (files.length === 0) return null;
  return (
    <section data-testid="invoice-files">
      <SectionHeading>Files</SectionHeading>
      <ul className="space-y-1.5" aria-label="Invoice files">
        {files.map((f) => (
          <FileRow key={f.id} file={f} />
        ))}
      </ul>
    </section>
  );
}
