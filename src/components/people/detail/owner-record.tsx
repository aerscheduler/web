import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import type { OrganizationUser, WorkOrder } from "@/types/api";
import { useCurrentJobs, useCustomerProfile, useUpdateCustomerProfile, useUpdateResourceOwner, useWorkOrders, type OwnedAircraft } from "@/features/queries";
import { api } from "@/lib/api";
import { ChoiceProperty, EditableProperty } from "@/components/detail/editable-property";
import { useAuth } from "@/lib/auth";
import { canOpenWorkOrders, isAdmin } from "@/lib/permissions";
import { formatPhone } from "@/lib/phone";
import { cn, formatDate, formatMoney } from "@/lib/utils";
import { isOpenWorkOrder, workOrderAircraftName } from "@/lib/work-orders";
import { memberEmail } from "@/components/people/util";
import { DetailCard } from "@/components/detail/detail-page";
import { ListTable, ListTag, type ListTableColumn, type ListTableGroup } from "@/components/list-table";
import { WorkOrderFormModal } from "@/components/maintenance/work-order-form-modal";
import { WorkStatusIcon } from "@/components/maintenance/work-status-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * An aircraft owner's record, the shop's customer (Tony, 2026-09-30): how to reach them, changed
 * in place, and their aircraft and their jobs each on a tab of their own rather than stacked
 * cards on one page.
 */

/** What a changeable value looks like at rest: quiet until hovered, like the job's details. */
const valueButton =
  "flex min-h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 -ml-2 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:hover:bg-transparent";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-start gap-2 py-0.5 text-[13px]">
      <span className="pt-1.5 text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** One contact detail: click it to change it in a small form; Enter saves, Esc puts it back. */
function ContactField({
  label,
  value,
  shown,
  placeholder,
  inputMode,
  required,
  editable,
  onSave,
}: {
  label: string;
  value: string | null;
  shown?: React.ReactNode;
  placeholder: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  required?: boolean;
  editable: boolean;
  onSave: (next: string | null) => Promise<boolean>;
}) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [saving, setSaving] = React.useState(false);
  const id = `owner-${label.toLowerCase()}`;
  const display = value ? (shown ?? value) : <span className="text-muted-foreground">Not recorded</span>;
  if (!editable) {
    return (
      <Row label={label}>
        <span className="block min-h-8 truncate py-1.5">{display}</span>
      </Row>
    );
  }
  const save = async () => {
    const next = draft.trim() || null;
    if (required && !next) return;
    if (next === (value ?? null)) return setOpen(false);
    setSaving(true);
    const ok = await onSave(next);
    setSaving(false);
    if (ok) setOpen(false);
  };
  return (
    <Row label={label}>
      <Popover open={open} onOpenChange={(o) => (setOpen(o), o && setDraft(value ?? ""))}>
        <PopoverTrigger asChild>
          <button type="button" className={valueButton} aria-label={`Change the ${label.toLowerCase()}`}>
            <span className="truncate">{display}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 space-y-3">
          <label htmlFor={id} className="text-[12px] font-medium">
            {label}
          </label>
          <Input
            id={id}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              }
            }}
            placeholder={placeholder}
            inputMode={inputMode}
            aria-invalid={required && !draft.trim()}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || (required && !draft.trim())}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </Row>
  );
}

/**
 * How to reach them. The details are the person's, recorded through any aircraft they own (the
 * server keeps one copy), so an admin changes them here without finding an aircraft first.
 */
export function OwnerContactCard({ ou, owned }: { ou: OrganizationUser; owned: OwnedAircraft[] | undefined }) {
  const { roles } = useAuth();
  // Primary first from the server: any ownership row reaches the same person.
  const via = owned?.[0] ?? null;
  const update = useUpdateResourceOwner(via?.resource.id ?? 0);
  // An owner who has signed in keeps their own name and address; the shop no longer types them.
  const claimed = !!ou.claimedAt;
  const editable = isAdmin(roles) && !!via && !claimed;
  const email = memberEmail(ou);
  // Signing in shows them their aircraft, and their jobs and bills: somebody with none of those
  // here would see nothing, so the server refuses and the button is not offered. Until both
  // lists have loaded it shows, and the server's answer is the toast.
  const jobs = useOwnerJobs(ou.id).data;
  const nothingHere = owned?.length === 0 && jobs != null && !jobs.some((w) => isOpenWorkOrder(w) || w.billing === "invoiced");
  // Not an invitation (Tony, 2026-10-01): a note to the address on the record, with the code to join
  // with. Signing up at that address is what hands them this record; nothing is stored.
  const signInEmail = useMutation({
    mutationFn: () => api<{ sent: boolean; to: string; code: string }>(`/orgUsers/${ou.id}/owner-sign-in-email`, { method: "POST" }),
    onSuccess: (r) => toast.success(`Sent to ${r.to}. They sign up with that address and join with the code ${r.code}.`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't send the email"),
  });
  const rawPhone = ou.user?.details?.phone ?? null;
  const phone = formatPhone(rawPhone, ou.user?.details?.phoneCountry);

  const save = (field: "name" | "email" | "phone") => async (next: string | null) => {
    try {
      await update.mutateAsync({ ownerId: via!.id, [field]: next });
      toast.success(field === "name" ? "Name saved" : field === "email" ? "Email saved" : "Phone saved");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
      return false;
    }
  };

  return (
    <DetailCard
      title="Contact"
      description={
        claimed
          ? "They sign in with this address to see their aircraft, jobs and bills, and keep these details themselves."
          : editable
            ? "They have not signed up, so these are the details you keep for them. Click one to change it."
            : "They have not signed up, so these are the details the shop keeps for them."
      }
      docShot="owner-contact"
      action={
        // An archived record cannot be claimed, so there is nothing for them to sign in to.
        !claimed && !ou.archivedAt && isAdmin(roles) && email && !nothingHere ? (
          <Button size="sm" variant="outline" onClick={() => signInEmail.mutate()} disabled={signInEmail.isPending}>
            {signInEmail.isPending ? "Sending…" : "Email how to sign in"}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-0.5">
        <ContactField label="Name" value={ou.user?.name ?? null} placeholder="Ray Hollis" required editable={editable} onSave={save("name")} />
        <ContactField
          label="Email"
          value={email ?? null}
          shown={email ? <a href={`mailto:${email}`} className="hover:underline" onClick={(e) => editable && e.preventDefault()}>{email}</a> : undefined}
          placeholder="name@example.com"
          inputMode="email"
          editable={editable}
          onSave={save("email")}
        />
        <ContactField label="Phone" value={rawPhone} shown={phone ?? undefined} placeholder="(208) 555-0141" inputMode="tel" editable={editable} onSave={save("phone")} />
        <Row label="Added">
          <span className="block min-h-8 py-1.5">{formatDate(ou.createdAt, "MMMM d, yyyy")}</span>
        </Row>
      </div>
      {isAdmin(roles) && owned && owned.length === 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">They own no aircraft here, so their details are changed from an aircraft&apos;s Owners panel once they do.</p>
      )}
    </DetailCard>
  );
}

/**
 * What the shop keeps about a customer (Murray spec section 2): where the bill goes, how they
 * like to be reached, and notes. For the people who run jobs; changed by owners and admins.
 * Never shown to the person themselves.
 */
export function CustomerDetailsCard({ orgUserId }: { orgUserId: number }) {
  const { roles } = useAuth();
  const readable = canOpenWorkOrders(roles);
  const editable = isAdmin(roles);
  const q = useCustomerProfile(orgUserId, { enabled: readable });
  const update = useUpdateCustomerProfile(orgUserId);
  if (!readable) return null;
  const p = q.data;
  const save = async (patch: Parameters<typeof update.mutateAsync>[0], what: string) => {
    try {
      await update.mutateAsync(patch);
      toast.success(`${what} saved`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `Couldn't save the ${what.toLowerCase()}`);
      return false;
    }
  };
  return (
    <DetailCard title="Customer details" description="What the shop keeps about them. They never see this." docShot="customer-details">
      {q.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : !p ? (
        <p className="text-[13px] text-muted-foreground">Couldn&apos;t load these details.</p>
      ) : (
        <div className="space-y-0.5">
          <EditableProperty
            label="Billing address"
            shown={p.billingAddress}
            fields={[{ key: "billingAddress", label: "Billing address", placeholder: "Whitcomb Aviation LLC\n12 Taxiway B\nIdaho Falls, ID 83402", multiline: true, maxLength: 500 }]}
            values={{ billingAddress: p.billingAddress }}
            editable={editable}
            onSave={(v) => save({ billingAddress: v.billingAddress }, "Billing address")}
          />
          <ChoiceProperty
            label="Prefers"
            value={p.preferredContact}
            options={[
              { value: null, label: "No preference" },
              { value: "phone", label: "A call" },
              { value: "text", label: "A text" },
              { value: "email", label: "An email" },
            ]}
            editable={editable}
            onSave={(v) => save({ preferredContact: v as "email" | "phone" | "text" | null }, "Preference")}
          />
          <EditableProperty
            label="Notes"
            shown={p.notes}
            empty="No notes"
            fields={[{ key: "notes", label: "Notes for the shop", placeholder: "Calls back after 5pm. Pays by check.", multiline: true, maxLength: 2000 }]}
            values={{ notes: p.notes }}
            editable={editable}
            onSave={(v) => save({ notes: v.notes }, "Notes")}
          />
        </div>
      )}
    </DetailCard>
  );
}

const AIRCRAFT_COLUMNS: ListTableColumn[] = [
  { id: "role", header: "Role", width: "8rem" },
  { id: "shop", header: "In the shop", width: "11rem", narrow: "keep" },
];

/** The aircraft they own here, each opening its page, with where its current job stands. */
export function OwnerAircraftList({ owned, loading }: { owned: OwnedAircraft[]; loading: boolean }) {
  const navigate = useNavigate();
  const jobs = useCurrentJobs();
  if (loading) return <Skeleton className="h-32 w-full" />;
  const groups: ListTableGroup[] = [
    {
      id: "owned",
      label: "Owned",
      count: owned.length,
      rows: owned.map((row) => {
        const plane = row.resource.type?.plane;
        const job = jobs?.get(row.resource.id);
        const open = () => void navigate({ to: "/aircraft/$resourceId", params: { resourceId: String(row.resource.id) } });
        return {
          id: `aircraft-${row.id}`,
          label: plane?.tailNumber ?? `Aircraft ${row.resource.id}`,
          title: (
            <>
              <span className="font-mono font-medium">{plane?.tailNumber ?? `Aircraft ${row.resource.id}`}</span>{" "}
              <span className="text-muted-foreground">{[plane?.year, plane?.make, plane?.model].filter(Boolean).join(" ")}</span>
            </>
          ),
          tags: row.isPrimary ? <ListTag>Billed</ListTag> : undefined,
          onOpen: open,
          cells: {
            role: <span className="text-muted-foreground">{row.title || "Owner"}</span>,
            shop: job ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-[12px] text-muted-foreground">{job.label}</span> {job.statusLabel}
              </span>
            ) : (
              <span className="text-muted-foreground">{jobs ? "Not in the shop" : ""}</span>
            ),
          },
        };
      }),
    },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ListTable
        fill
        label="Their aircraft"
        columns={AIRCRAFT_COLUMNS}
        groups={groups}
        titleHeader="Aircraft"
        showHeader
        docShot="owner-aircraft"
        empty={<p className="px-4 py-6 text-[13px] text-muted-foreground">Not the owner of any aircraft. Add them on an aircraft&apos;s Owners panel.</p>}
      />
    </div>
  );
}

const JOB_COLUMNS: ListTableColumn[] = [
  { id: "stage", header: "Stage", width: "9rem" },
  { id: "day", header: "Day", width: "6rem", align: "end" },
  { id: "charges", header: "Charges", width: "6.5rem", align: "end", narrow: "keep" },
];

/** The jobs billed to them: the open ones first, oldest first, then what is finished, newest first. */
export function OwnerWorkOrdersList({ rows, loading }: { rows: WorkOrder[]; loading: boolean }) {
  const navigate = useNavigate();
  const { roles } = useAuth();
  const [opening, setOpening] = React.useState(false);
  if (loading) return <Skeleton className="h-32 w-full" />;
  const open = rows.filter(isOpenWorkOrder).sort((a, b) => a.number - b.number);
  const finishedOn = (w: WorkOrder) => w.closedAt ?? w.completedAt ?? w.openedAt;
  const finished = rows.filter((w) => !isOpenWorkOrder(w)).sort((a, b) => finishedOn(b).localeCompare(finishedOn(a)) || b.number - a.number);
  const row = (w: WorkOrder, done: boolean) => ({
    id: `job-${w.id}`,
    label: `${w.label} ${workOrderAircraftName(w)}`,
    testId: `owner-job-${w.id}`,
    leading: <WorkStatusIcon status={done ? (w.status === "cancelled" ? "declined" : "done") : w.status === "requested" ? "todo" : w.status === "scheduled" ? "approved" : "progress"} />,
    title: (
      <>
        <span className="font-mono text-[12px] whitespace-nowrap text-muted-foreground">{w.label}</span>{" "}
        <span className="font-mono font-medium whitespace-nowrap">{workOrderAircraftName(w)}</span>{" "}
        <span>{w.complaint || "No request written"}</span>
      </>
    ),
    tags: w.billing !== "none" ? <ListTag>{w.billing === "paid" ? "Paid" : "Invoiced"}</ListTag> : undefined,
    dim: done,
    onOpen: () => void navigate({ to: "/maintenance/work-orders/$workOrderId", params: { workOrderId: String(w.id) } }),
    cells: {
      stage: <span className={cn(!done && "text-foreground")}>{w.statusLabel}</span>,
      day: (
        <span className="text-muted-foreground">
          {done ? formatDate(finishedOn(w), "MMM d", "") : w.promisedOn ? formatDate(`${w.promisedOn}T12:00:00`, "MMM d", "") : ""}
        </span>
      ),
      charges: w.chargesCents ? <span className="font-medium">{formatMoney(w.chargesCents)}</span> : <span className="text-muted-foreground">$0.00</span>,
    },
  });
  const groups: ListTableGroup[] = [
    { id: "open", label: "Open", count: open.length, rows: open.map((w) => row(w, false)) },
    { id: "finished", label: "Finished", count: finished.length, rows: finished.map((w) => row(w, true)) },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ListTable
        fill
        label="Their work orders"
        columns={JOB_COLUMNS}
        groups={groups}
        titleHeader="Job"
        showHeader
        docShot="owner-work-orders"
        toolbar={
          canOpenWorkOrders(roles) ? (
            <div className="flex w-full items-center justify-between gap-3 px-4 py-3">
              <p className="text-[13px] text-muted-foreground">Jobs billed to them. The day is when it is promised back, or when it finished.</p>
              <Button size="sm" variant="outline" onClick={() => setOpening(true)}>
                <Plus className="size-4" /> Open a work order
              </Button>
            </div>
          ) : undefined
        }
        empty={<p className="px-4 py-6 text-[13px] text-muted-foreground">No work orders billed to them yet.</p>}
      />
      {opening && <WorkOrderFormModal open onOpenChange={(o) => !o && setOpening(false)} />}
    </div>
  );
}

/** Their jobs, for the tab and its count. */
export function useOwnerJobs(orgUserId: number) {
  const { roles } = useAuth();
  return useWorkOrders({ state: "all", billToOrgUserId: orgUserId }, { enabled: canOpenWorkOrders(roles) });
}
