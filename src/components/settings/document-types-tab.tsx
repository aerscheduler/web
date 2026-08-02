import * as React from "react";
import { FileCog, Loader2, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { pageRows, useCreateDocumentType, useDeleteDocumentType, useDocumentTypesPage, useUpdateDocumentType } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import type { DocumentType, DocumentTypeInput } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

function errMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

/**
 * Manage the org's document categories (medical, photo ID, renter agreement…). These
 * are what members pick from when uploading on their Documents page — previously only
 * creatable from the mobile app.
 */
export function DocumentTypesTab() {
  const paging = usePaging();
  const q = useDocumentTypesPage(paging);
  const del = useDeleteDocumentType();
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DocumentType | null>(null);

  const { rows: types, total } = pageRows(q);

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(type: DocumentType) {
    setEditing(type);
    setFormOpen(true);
  }

  async function remove(type: DocumentType) {
    const ok = await confirm({
      title: `Delete "${type.name}"?`,
      description:
        "Documents already filed under this type stay on members' records, but the type disappears from the upload picker and can't be filed against again.",
      confirmLabel: "Delete type",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(type.id, {
      onSuccess: () => toast.success(`"${type.name}" deleted.`),
      onError: (e) => toast.error(errMessage(e, "Couldn't delete this document type.")),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <FileCog className="size-4" />
          </span>
          <div>
            <CardTitle>Document types</CardTitle>
            <CardDescription>
              The categories members file documents under — medicals, certificates,
              agreements.
            </CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="size-4" /> Add type
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-5 w-24" />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : total === 0 ? (
          <EmptyState
            icon={FileCog}
            title="No document types yet"
            body="Add types like Medical Certificate, Photo ID, or Renter Agreement so members know what to upload."
            action={
              <Button size="sm" onClick={openAdd}>
                <Plus className="size-4" /> Add type
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {types.map((t) => (
              <TypeRow key={t.id} type={t} onEdit={openEdit} onDelete={remove} />
            ))}
          </ul>
        )}
        <TablePagination
          paging={paging}
          total={total}
          returned={types.length}
          loading={q.isFetching}
          className="px-1"
        />
      </CardContent>

      <DocumentTypeFormModal open={formOpen} onOpenChange={setFormOpen} type={editing} />
    </Card>
  );
}

function TypeRow({
  type,
  onEdit,
  onDelete,
}: {
  type: DocumentType;
  onEdit: (type: DocumentType) => void;
  onDelete: (type: DocumentType) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{type.name}</span>
          {!type.active && <Badge variant="secondary">Inactive</Badge>}
          {type.restricted && (
            <Badge variant="warning">
              <Lock className="size-3" /> Admin only
            </Badge>
          )}
          {type.expires && (
            <Badge variant="outline">
              Expires
              {type.warningPeriod != null && ` · warn ${type.warningPeriod}d ahead`}
            </Badge>
          )}
        </div>
        {type.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{type.description}</p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${type.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => onEdit(type)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void onDelete(type)}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

type FormState = {
  name: string;
  description: string;
  restricted: boolean;
  expires: boolean;
  warningPeriod: string;
  active: boolean;
};

/** Required fields, in focus order, mapped to their input ids for error focus. */
const REQUIRED_FIELDS = [
  { key: "name", id: "dt-name" },
  { key: "warningPeriod", id: "dt-warning" },
] as const;

function emptyState(): FormState {
  return {
    name: "",
    description: "",
    restricted: false,
    expires: false,
    warningPeriod: "30",
    active: true,
  };
}

function stateFromType(t: DocumentType): FormState {
  return {
    name: t.name,
    description: t.description ?? "",
    restricted: t.restricted,
    expires: t.expires,
    warningPeriod: t.warningPeriod != null ? String(t.warningPeriod) : "30",
    active: t.active,
  };
}

/** Add / edit a document type. When `type` is provided the modal is in edit mode. */
function DocumentTypeFormModal({
  open,
  onOpenChange,
  type,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: DocumentType | null;
}) {
  const isEdit = !!type;
  const create = useCreateDocumentType();
  const update = useUpdateDocumentType();
  const pending = create.isPending || update.isPending;

  const [form, setForm] = React.useState<FormState>(emptyState);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = React.useState(false);

  // Reset whenever the modal opens (fresh add, or prefilled edit).
  React.useEffect(() => {
    if (!open) return;
    setForm(type ? stateFromType(type) : emptyState());
    setShowErrors(false);
  }, [open, type]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const warningPeriod = Number(form.warningPeriod);
  // Per-field validity, derived every render so inline messages clear as you type.
  const errors: Record<string, string> = {
    name: form.name.trim().length === 0 ? "Enter a name." : "",
    // The server refuses to create an expiring type without one.
    warningPeriod:
      form.expires && (!form.warningPeriod.trim() || !warningPeriod || warningPeriod < 1)
        ? "Enter how many days ahead to start warning."
        : "",
  };
  const firstInvalid = REQUIRED_FIELDS.find((f) => errors[f.key]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    // Instead of a silently-disabled button, tell the user exactly what's missing.
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(firstInvalid.id)?.focus();
      return;
    }

    const name = form.name.trim();
    const input: DocumentTypeInput = {
      name,
      description: form.description.trim() || null,
      restricted: form.restricted,
      expires: form.expires,
      active: form.active,
      warningPeriod: form.expires ? warningPeriod : null,
    };

    const done = {
      onSuccess: () => {
        toast.success(isEdit ? `"${name}" updated.` : `"${name}" added.`);
        onOpenChange(false);
      },
      onError: (e: unknown) =>
        toast.error(errMessage(e, "Couldn't save this document type.")),
    };

    if (isEdit && type) update.mutate({ id: type.id, ...input }, done);
    else create.mutate(input, done);
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      title={isEdit ? `Edit ${type?.name}` : "Add document type"}
      description={
        isEdit
          ? "Update what members are asked to upload for this category."
          : "Define a category members can file documents under."
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dt-name">Name</Label>
          <Input
            id="dt-name"
            autoFocus
            maxLength={60}
            placeholder="Medical Certificate"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={showErrors && !!errors.name}
          />
          {showErrors && errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="dt-description">Description</Label>
          <Textarea
            id="dt-description"
            rows={2}
            maxLength={500}
            placeholder="Shown under the type when a member picks it at upload."
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <div className="min-w-0">
            <Label htmlFor="dt-restricted" className="cursor-pointer">
              Admin upload only
            </Label>
            <p className="text-xs text-muted-foreground">
              Members won&rsquo;t see this type in their upload picker — an admin files it
              on their behalf.
            </p>
          </div>
          <Switch
            id="dt-restricted"
            checked={form.restricted}
            onCheckedChange={(v) => set("restricted", v)}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <div className="min-w-0">
            <Label htmlFor="dt-expires" className="cursor-pointer">
              Has an expiry date
            </Label>
            <p className="text-xs text-muted-foreground">
              Every upload of this type must carry an expiry date.
            </p>
          </div>
          <Switch
            id="dt-expires"
            checked={form.expires}
            onCheckedChange={(v) => set("expires", v)}
          />
        </div>

        {/* A warning period only means anything for a type that expires. */}
        {form.expires && (
          <div className="space-y-1.5">
            <Label htmlFor="dt-warning">Warn this many days ahead</Label>
            <Input
              id="dt-warning"
              inputMode="numeric"
              placeholder="30"
              className="tnum"
              value={form.warningPeriod}
              onChange={(e) =>
                set("warningPeriod", e.target.value.replace(/[^0-9]/g, "").slice(0, 4))
              }
              aria-invalid={showErrors && !!errors.warningPeriod}
            />
            {showErrors && errors.warningPeriod ? (
              <p className="text-xs text-destructive">{errors.warningPeriod}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Documents start showing as expiring soon this many days before the date.
              </p>
            )}
          </div>
        )}

        {isEdit && type?.expires && !form.expires && (
          <p className="text-xs text-[color-mix(in_oklch,var(--warning)_70%,var(--foreground))]">
            Turning expiry off clears the expiry date on every document already filed
            under this type.
          </p>
        )}

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5">
          <div className="min-w-0">
            <Label htmlFor="dt-active" className="cursor-pointer">
              Active
            </Label>
            <p className="text-xs text-muted-foreground">
              Inactive types stay on existing documents but aren&rsquo;t offered for new
              uploads.
            </p>
          </div>
          <Switch
            id="dt-active"
            checked={form.active}
            onCheckedChange={(v) => set("active", v)}
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add type"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
