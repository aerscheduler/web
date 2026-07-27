import * as React from "react";
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  Plane,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateOrgUserGroup,
  useCreateResourceGroup,
  useDeleteOrgUserGroup,
  useDeleteResourceGroup,
  useOrgUserGroup,
  useOrgUserGroups,
  useOrgUsers,
  useResourceGroup,
  useResourceGroups,
  useResources,
  useUpdateOrgUserGroup,
  useUpdateResourceGroup,
} from "@/features/queries";
import type {
  OrgUserGroup,
  OrgUserGroupInput,
  Resource,
  ResourceGroup,
  ResourceGroupInput,
} from "@/types/api";
import { ApiError } from "@/lib/api";
import { memberName } from "@/components/people/util";
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
import { Checkbox } from "@/components/ui/checkbox";
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

/** Deleting a group silently un-scopes every currency rule that pointed at it. */
const DELETE_WARNING =
  "Any currency rule scoped to this group loses that scope — a rule left with no groups matches nobody and stops enforcing anything.";

/**
 * Groups are the scope currency rules are written against: a rule applies to the
 * aircraft in its resource groups, for the people in its org-user groups. Without a
 * group to name, a rule gates nothing — so this tab is the prerequisite for currencies.
 */
export function GroupsTab() {
  return (
    <div className="space-y-4">
      <ResourceGroupsCard />
      <OrgUserGroupsCard />
    </div>
  );
}

// ── Aircraft groups ──────────────────────────────────────────────────────────

function ResourceGroupsCard() {
  const q = useResourceGroups();
  const del = useDeleteResourceGroup();
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ResourceGroup | null>(null);

  const groups = q.data ?? [];

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(group: ResourceGroup) {
    setEditing(group);
    setFormOpen(true);
  }

  async function remove(group: ResourceGroup) {
    const ok = await confirm({
      title: `Delete "${group.name}"?`,
      description: `The aircraft themselves are untouched. ${DELETE_WARNING}`,
      confirmLabel: "Delete group",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(group.id, {
      onSuccess: () => toast.success(`"${group.name}" deleted.`),
      onError: (e) => toast.error(errMessage(e, "Couldn't delete this group.")),
    });
  }

  return (
    <Card>
      <SectionHeader
        icon={<Plane className="size-4" />}
        title="Aircraft groups"
        description="Sets of aircraft, rooms and simulators — what a currency rule is scoped to."
        onAdd={openAdd}
        addLabel="Add group"
      />
      <CardContent className="p-0">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Plane}
            title="No aircraft groups yet"
            body="Group aircraft — Complex Singles, Twins, the whole fleet — so currency rules have something to apply to."
            action={
              <Button size="sm" onClick={openAdd}>
                <Plus className="size-4" /> Add group
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((g) => (
              <ResourceGroupRow
                key={g.id}
                group={g}
                onEdit={openEdit}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <ResourceGroupFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        group={editing}
      />
    </Card>
  );
}

function ResourceGroupRow({
  group,
  onEdit,
  onDelete,
}: {
  group: ResourceGroup;
  onEdit: (group: ResourceGroup) => void;
  onDelete: (group: ResourceGroup) => void;
}) {
  // The list endpoint returns only id/name/description — members AND the auto-join
  // flags come from the detail fetch, which also warms the cache the edit form reads.
  const detail = useResourceGroup(group.id);
  const count = detail.data?.resources?.length;

  return (
    <GroupRow
      name={group.name}
      description={group.description}
      countLabel={count == null ? null : count === 1 ? "1 resource" : `${count} resources`}
      badges={autoJoinBadges(RESOURCE_AUTO_JOIN, detail.data ?? {})}
      onEdit={() => onEdit(group)}
      onDelete={() => void onDelete(group)}
    />
  );
}

// ── People groups ────────────────────────────────────────────────────────────

function OrgUserGroupsCard() {
  const q = useOrgUserGroups();
  const del = useDeleteOrgUserGroup();
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OrgUserGroup | null>(null);

  const groups = q.data ?? [];

  function openAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(group: OrgUserGroup) {
    setEditing(group);
    setFormOpen(true);
  }

  async function remove(group: OrgUserGroup) {
    const ok = await confirm({
      title: `Delete "${group.name}"?`,
      description: `Nobody loses their membership or roles. ${DELETE_WARNING}`,
      confirmLabel: "Delete group",
      destructive: true,
    });
    if (!ok) return;
    del.mutate(group.id, {
      onSuccess: () => toast.success(`"${group.name}" deleted.`),
      onError: (e) => toast.error(errMessage(e, "Couldn't delete this group.")),
    });
  }

  return (
    <Card>
      <SectionHeader
        icon={<Users className="size-4" />}
        title="People groups"
        description="Sets of members — who a currency rule applies to."
        onAdd={openAdd}
        addLabel="Add group"
      />
      <CardContent className="p-0">
        {q.isPending ? (
          <RowsSkeleton />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No people groups yet"
            body="Group members — Primary Students, Club Renters, CFIs — so currency rules know who they cover."
            action={
              <Button size="sm" onClick={openAdd}>
                <Plus className="size-4" /> Add group
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {groups.map((g) => (
              <OrgUserGroupRow
                key={g.id}
                group={g}
                onEdit={openEdit}
                onDelete={remove}
              />
            ))}
          </ul>
        )}
      </CardContent>

      <OrgUserGroupFormModal
        open={formOpen}
        onOpenChange={setFormOpen}
        group={editing}
      />
    </Card>
  );
}

function OrgUserGroupRow({
  group,
  onEdit,
  onDelete,
}: {
  group: OrgUserGroup;
  onEdit: (group: OrgUserGroup) => void;
  onDelete: (group: OrgUserGroup) => void;
}) {
  // Same as aircraft groups: membership and flags only come back from the detail.
  const detail = useOrgUserGroup(group.id);
  const count = detail.data?.orgUsers?.length;

  return (
    <GroupRow
      name={group.name}
      description={group.description}
      countLabel={count == null ? null : count === 1 ? "1 member" : `${count} members`}
      badges={autoJoinBadges(ORG_USER_AUTO_JOIN, detail.data ?? {})}
      onEdit={() => onEdit(group)}
      onDelete={() => void onDelete(group)}
    />
  );
}

// ── Shared list pieces ───────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  description,
  onAdd,
  addLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <CardHeader className="flex-row items-start justify-between gap-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          {icon}
        </span>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
      <Button size="sm" onClick={onAdd}>
        <Plus className="size-4" /> {addLabel}
      </Button>
    </CardHeader>
  );
}

function GroupRow({
  name,
  description,
  countLabel,
  badges,
  onEdit,
  onDelete,
}: {
  name: string;
  description?: string | null;
  countLabel: string | null;
  badges: string[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{name}</span>
          {countLabel ? (
            <Badge variant="secondary">{countLabel}</Badge>
          ) : (
            <Skeleton className="h-5 w-20 rounded-full" />
          )}
          {badges.map((b) => (
            <Badge key={b} variant="outline">
              Auto-adds {b}
            </Badge>
          ))}
        </div>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={onEdit}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

function RowsSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Skeleton className="h-5 w-52" />
          <Skeleton className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** The auto-join rules that are switched on, as short badge labels. */
function autoJoinBadges<K extends string>(
  options: readonly AutoJoinOption<K>[],
  group: Partial<Record<K, boolean>>
): string[] {
  return options.filter((o) => group[o.key] === true).map((o) => o.badge);
}

// ── Auto-join rule definitions ───────────────────────────────────────────────
// These booleans are what keeps a group from going stale: rather than someone
// remembering to add each new aircraft or student, the group absorbs them.

type AutoJoinOption<K extends string> = {
  key: K;
  label: string;
  badge: string;
  hint: string;
};

type ResourceFlagKey =
  | "addNewResources"
  | "addNewPlanes"
  | "addNewRooms"
  | "addNewSimulators";

const RESOURCE_AUTO_JOIN: readonly AutoJoinOption<ResourceFlagKey>[] = [
  {
    key: "addNewResources",
    label: "Everything added later",
    badge: "everything",
    hint: "The catch-all — any aircraft, room or simulator added later joins this group.",
  },
  {
    key: "addNewPlanes",
    label: "New aircraft",
    badge: "aircraft",
    hint: "Aircraft added later join automatically.",
  },
  {
    key: "addNewRooms",
    label: "New rooms",
    badge: "rooms",
    hint: "Briefing rooms added later join automatically.",
  },
  {
    key: "addNewSimulators",
    label: "New simulators",
    badge: "simulators",
    hint: "Simulators added later join automatically.",
  },
];

type OrgUserFlagKey =
  | "addNewUsers"
  | "addNewStudents"
  | "addNewInstructors"
  | "addNewRenters"
  | "addNewTechnicians"
  | "addNewDispatchers"
  | "addNewAdmins"
  | "addNewOwners";

const ORG_USER_AUTO_JOIN: readonly AutoJoinOption<OrgUserFlagKey>[] = [
  {
    key: "addNewUsers",
    label: "Everyone who joins later",
    badge: "everyone",
    hint: "The catch-all — every new member joins this group whatever their role.",
  },
  {
    key: "addNewStudents",
    label: "New students",
    badge: "students",
    hint: "Anyone given the student role later joins automatically.",
  },
  {
    key: "addNewInstructors",
    label: "New instructors",
    badge: "instructors",
    hint: "Anyone given the instructor role later joins automatically.",
  },
  {
    key: "addNewRenters",
    label: "New renters",
    badge: "renters",
    hint: "Anyone given the renter role later joins automatically.",
  },
  {
    key: "addNewTechnicians",
    label: "New technicians",
    badge: "technicians",
    hint: "Anyone given the technician role later joins automatically.",
  },
  {
    key: "addNewDispatchers",
    label: "New dispatchers",
    badge: "dispatchers",
    hint: "Anyone given the dispatcher role later joins automatically.",
  },
  {
    key: "addNewAdmins",
    label: "New admins",
    badge: "admins",
    hint: "Anyone given the admin role later joins automatically.",
  },
  {
    key: "addNewOwners",
    label: "New owners",
    badge: "owners",
    hint: "Anyone given the owner role later joins automatically.",
  },
];

// ── Aircraft group form ──────────────────────────────────────────────────────

type ResourceFormState = Record<ResourceFlagKey, boolean> & {
  name: string;
  description: string;
  resourceIds: number[];
};

/** Required fields, in focus order, mapped to their input ids for error focus. */
const RESOURCE_REQUIRED_FIELDS = [{ key: "name", id: "rg-name" }] as const;

function emptyResourceForm(): ResourceFormState {
  return {
    name: "",
    description: "",
    addNewResources: false,
    addNewPlanes: false,
    addNewRooms: false,
    addNewSimulators: false,
    resourceIds: [],
  };
}

function resourceFormFrom(g: ResourceGroup): ResourceFormState {
  return {
    name: g.name,
    description: g.description ?? "",
    addNewResources: !!g.addNewResources,
    addNewPlanes: !!g.addNewPlanes,
    addNewRooms: !!g.addNewRooms,
    addNewSimulators: !!g.addNewSimulators,
    // Filled in once the detail fetch lands — the list omits members.
    resourceIds: (g.resources ?? []).map((r) => r.id),
  };
}

function resourceLabel(r: Resource): string {
  const p = r.type?.plane;
  if (p) return [p.tailNumber, [p.make, p.model].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");
  const sim = r.type?.simulator;
  if (sim) return `${sim.name} (simulator)`;
  const room = r.type?.room;
  if (room) return `Room ${room.roomNumber}`;
  return `Resource #${r.id}`;
}

function ResourceGroupFormModal({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: ResourceGroup | null;
}) {
  const isEdit = !!group;
  const create = useCreateResourceGroup();
  const update = useUpdateResourceGroup();
  const pending = create.isPending || update.isPending;

  const resources = useResources({ enabled: open });
  // Membership and the auto-join flags live only on the detail endpoint.
  const detail = useResourceGroup(open && group ? group.id : null);
  // Which group the detail has already been folded into the form for, so a
  // background refetch never overwrites what the user is in the middle of typing.
  const seeded = React.useRef<number | null>(null);

  const [form, setForm] = React.useState<ResourceFormState>(emptyResourceForm);
  // Surfaced only after a submit attempt, so we don't nag on a pristine form.
  const [showErrors, setShowErrors] = React.useState(false);

  // Reset whenever the modal opens (fresh add, or prefilled edit).
  React.useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    setForm(group ? resourceFormFrom(group) : emptyResourceForm());
    setShowErrors(false);
  }, [open, group]);

  // The row data is name-and-description only; fill the rest in when it lands.
  React.useEffect(() => {
    const full = detail.data;
    if (!open || !full || seeded.current === full.id) return;
    seeded.current = full.id;
    setForm(resourceFormFrom(full));
  }, [open, detail.data]);

  const set = <K extends keyof ResourceFormState>(key: K, value: ResourceFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Per-field validity, derived every render so inline messages clear as you type.
  const errors: Record<string, string> = {
    name: form.name.trim().length === 0 ? "Enter a name." : "",
  };
  const firstInvalid = RESOURCE_REQUIRED_FIELDS.find((f) => errors[f.key]);

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
    const input: ResourceGroupInput = {
      name,
      description: form.description.trim() || null,
      addNewResources: form.addNewResources,
      addNewPlanes: form.addNewPlanes,
      addNewRooms: form.addNewRooms,
      addNewSimulators: form.addNewSimulators,
      resourceIds: form.resourceIds,
    };

    const done = {
      onSuccess: () => {
        toast.success(isEdit ? `"${name}" updated.` : `"${name}" created.`);
        onOpenChange(false);
      },
      onError: (e: unknown) => toast.error(errMessage(e, "Couldn't save this group.")),
    };

    if (isEdit && group) update.mutate({ id: group.id, input }, done);
    else create.mutate(input, done);
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      title={isEdit ? `Edit ${group?.name}` : "Add aircraft group"}
      description="Currency rules apply to the aircraft in a group — pick them here, or let the group fill itself."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="rg-name">Name</Label>
          <Input
            id="rg-name"
            autoFocus
            maxLength={60}
            placeholder="Complex singles"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={showErrors && !!errors.name}
          />
          {showErrors && errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rg-description">Description</Label>
          <Textarea
            id="rg-description"
            rows={2}
            maxLength={500}
            placeholder="What this group is for."
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <MemberPicker
          legend="Members"
          searchId="rg-search"
          searchPlaceholder="Search aircraft…"
          loading={resources.isLoading || detail.isLoading}
          items={(resources.data ?? []).map((r) => ({
            id: r.id,
            label: resourceLabel(r),
            sub: r.location?.name ?? undefined,
          }))}
          selected={form.resourceIds}
          onChange={(ids) => set("resourceIds", ids)}
          emptyText="No aircraft, rooms or simulators to pick from yet."
        />

        <AutoJoinFieldset
          idPrefix="rg"
          options={RESOURCE_AUTO_JOIN}
          values={form}
          onToggle={(key, value) => set(key, value)}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create group"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

// ── People group form ────────────────────────────────────────────────────────

type OrgUserFormState = Record<OrgUserFlagKey, boolean> & {
  name: string;
  description: string;
  orgUserIds: number[];
};

const ORG_USER_REQUIRED_FIELDS = [{ key: "name", id: "oug-name" }] as const;

function emptyOrgUserForm(): OrgUserFormState {
  return {
    name: "",
    description: "",
    addNewUsers: false,
    addNewStudents: false,
    addNewInstructors: false,
    addNewRenters: false,
    addNewTechnicians: false,
    addNewDispatchers: false,
    addNewAdmins: false,
    addNewOwners: false,
    orgUserIds: [],
  };
}

function orgUserFormFrom(g: OrgUserGroup): OrgUserFormState {
  return {
    name: g.name,
    description: g.description ?? "",
    addNewUsers: !!g.addNewUsers,
    addNewStudents: !!g.addNewStudents,
    addNewInstructors: !!g.addNewInstructors,
    addNewRenters: !!g.addNewRenters,
    addNewTechnicians: !!g.addNewTechnicians,
    addNewDispatchers: !!g.addNewDispatchers,
    addNewAdmins: !!g.addNewAdmins,
    addNewOwners: !!g.addNewOwners,
    orgUserIds: (g.orgUsers ?? []).map((m) => m.id),
  };
}

function OrgUserGroupFormModal({
  open,
  onOpenChange,
  group,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: OrgUserGroup | null;
}) {
  const isEdit = !!group;
  const create = useCreateOrgUserGroup();
  const update = useUpdateOrgUserGroup();
  const pending = create.isPending || update.isPending;

  const members = useOrgUsers({ enabled: open });
  const detail = useOrgUserGroup(open && group ? group.id : null);
  const seeded = React.useRef<number | null>(null);

  const [form, setForm] = React.useState<OrgUserFormState>(emptyOrgUserForm);
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    setForm(group ? orgUserFormFrom(group) : emptyOrgUserForm());
    setShowErrors(false);
  }, [open, group]);

  React.useEffect(() => {
    const full = detail.data;
    if (!open || !full || seeded.current === full.id) return;
    seeded.current = full.id;
    setForm(orgUserFormFrom(full));
  }, [open, detail.data]);

  const set = <K extends keyof OrgUserFormState>(key: K, value: OrgUserFormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const errors: Record<string, string> = {
    name: form.name.trim().length === 0 ? "Enter a name." : "",
  };
  const firstInvalid = ORG_USER_REQUIRED_FIELDS.find((f) => errors[f.key]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(firstInvalid.id)?.focus();
      return;
    }

    const name = form.name.trim();
    const input: OrgUserGroupInput = {
      name,
      description: form.description.trim() || null,
      addNewUsers: form.addNewUsers,
      addNewStudents: form.addNewStudents,
      addNewInstructors: form.addNewInstructors,
      addNewRenters: form.addNewRenters,
      addNewTechnicians: form.addNewTechnicians,
      addNewDispatchers: form.addNewDispatchers,
      addNewAdmins: form.addNewAdmins,
      addNewOwners: form.addNewOwners,
      orgUserIds: form.orgUserIds,
    };

    const done = {
      onSuccess: () => {
        toast.success(isEdit ? `"${name}" updated.` : `"${name}" created.`);
        onOpenChange(false);
      },
      onError: (e: unknown) => toast.error(errMessage(e, "Couldn't save this group.")),
    };

    if (isEdit && group) update.mutate({ id: group.id, input }, done);
    else create.mutate(input, done);
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
      title={isEdit ? `Edit ${group?.name}` : "Add people group"}
      description="Currency rules apply to the members in a group — pick them here, or let the group fill itself."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="oug-name">Name</Label>
          <Input
            id="oug-name"
            autoFocus
            maxLength={60}
            placeholder="Club renters"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            aria-invalid={showErrors && !!errors.name}
          />
          {showErrors && errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="oug-description">Description</Label>
          <Textarea
            id="oug-description"
            rows={2}
            maxLength={500}
            placeholder="What this group is for."
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </div>

        <MemberPicker
          legend="Members"
          searchId="oug-search"
          searchPlaceholder="Search members…"
          loading={members.isLoading || detail.isLoading}
          items={(members.data ?? []).map((m) => ({
            id: m.id,
            label: memberName(m),
            sub: m.user?.email ?? undefined,
          }))}
          selected={form.orgUserIds}
          onChange={(ids) => set("orgUserIds", ids)}
          emptyText="No members to pick from yet."
        />

        <AutoJoinFieldset
          idPrefix="oug"
          options={ORG_USER_AUTO_JOIN}
          values={form}
          onToggle={(key, value) => set(key, value)}
        />

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create group"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

// ── Shared form pieces ───────────────────────────────────────────────────────

/** A checkbox list of candidate members, with a filter once the list gets long. */
function MemberPicker({
  legend,
  searchId,
  searchPlaceholder,
  items,
  selected,
  onChange,
  loading,
  emptyText,
}: {
  legend: string;
  searchId: string;
  searchPlaceholder: string;
  items: { id: number; label: string; sub?: string }[];
  selected: number[];
  onChange: (ids: number[]) => void;
  loading: boolean;
  emptyText: string;
}) {
  const [filter, setFilter] = React.useState("");

  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? items.filter(
        (i) =>
          i.label.toLowerCase().includes(needle) ||
          (i.sub ?? "").toLowerCase().includes(needle)
      )
    : items;

  function toggle(id: number, on: boolean) {
    onChange(on ? [...selected, id] : selected.filter((x) => x !== id));
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{legend}</Label>
        <span className="text-xs text-muted-foreground">{selected.length} selected</span>
      </div>

      {items.length > 6 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id={searchId}
            className="pl-8"
            placeholder={searchPlaceholder}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      )}

      <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
        {loading ? (
          <div className="space-y-2 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-40" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">{emptyText}</p>
        ) : shown.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            Nothing matches &ldquo;{filter}&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((i) => {
              const inputId = `${searchId}-opt-${i.id}`;
              return (
                <li key={i.id} className="flex items-center gap-3 px-3 py-2">
                  <Checkbox
                    id={inputId}
                    checked={selected.includes(i.id)}
                    onCheckedChange={(v) => toggle(i.id, v === true)}
                  />
                  <Label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block truncate text-sm font-normal">{i.label}</span>
                    {i.sub && (
                      <span className="block truncate text-xs font-normal text-muted-foreground">
                        {i.sub}
                      </span>
                    )}
                  </Label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The auto-join switches. Without these a group is a list somebody has to remember
 * to update; with them it keeps itself current as the fleet or roster changes.
 */
function AutoJoinFieldset<K extends string>({
  idPrefix,
  options,
  values,
  onToggle,
}: {
  idPrefix: string;
  options: readonly AutoJoinOption<K>[];
  values: Record<K, boolean>;
  onToggle: (key: K, value: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Auto-join rules</Label>
      <p className="text-xs text-muted-foreground">
        Anything added to the organization later joins this group on its own — no need to
        come back and edit the list.
      </p>
      <div className="space-y-2 pt-0.5">
        {options.map((o) => {
          const id = `${idPrefix}-${o.key}`;
          return (
            <div
              key={o.key}
              className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2.5"
            >
              <div className="min-w-0">
                <Label htmlFor={id} className="cursor-pointer">
                  {o.label}
                </Label>
                <p className="text-xs text-muted-foreground">{o.hint}</p>
              </div>
              <Switch
                id={id}
                checked={values[o.key]}
                onCheckedChange={(v) => onToggle(o.key, v)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
