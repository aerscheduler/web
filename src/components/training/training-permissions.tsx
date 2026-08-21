import { useState } from "react";
import { KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { rolesOf, type TrainingGrant, type TrainingGrantOption } from "@/types/api";
import {
  useCourses,
  useCreateTrainingGrant,
  useMembers,
  useRevokeTrainingGrant,
  useTrainingGrantCatalog,
  useTrainingGrants,
} from "@/features/queries";
import { Badge } from "@/components/ui/badge";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Who may do what in training, beyond the ordinary roles.
 *
 * The screen leads with what each grant MEANS rather than with a list of people, because
 * three of the four are things an admin gives away rarely and needs to think about once.
 * The auditor row in particular is the one worth reading before clicking: it hands somebody
 * every training record in the school.
 *
 * Everything here is additive. Nothing on this screen can take a capability away from an
 * administrator, which is why there is no "revoke admin" affordance to look for.
 */
export function TrainingPermissions() {
  const catalog = useTrainingGrantCatalog();
  const grants = useTrainingGrants();
  const revoke = useRevokeTrainingGrant();
  const [granting, setGranting] = useState<TrainingGrantOption | null>(null);

  const options = catalog.data ?? [];
  const rows = grants.data ?? [];

  if (catalog.isPending || grants.isPending) return null;

  return (
    <Card className="p-4" data-doc-shot="training-permissions-tab">
      <div className="mb-1 flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Training permissions</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Administrators already configure training and enroll students. These grants let you hand
        those jobs to somebody who is not an administrator, and cover two things nobody has by
        default.
      </p>

      <div className="space-y-3">
        {options.map((option) => {
          const held = rows.filter((r) => r.grant === option.grant);
          return (
            <div key={option.grant} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{option.label}</span>
                    {option.courseScoped ? (
                      <Badge variant="outline" className="text-[10px]">
                        per course
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{option.description}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setGranting(option)}>
                  <Plus className="size-4" /> Add
                </Button>
              </div>

              {held.length ? (
                <ul className="mt-2.5 space-y-1">
                  {held.map((g) => (
                    <GrantRow key={g.id} grant={g} onRevoke={() => revoke.mutate(g.id)} />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Nobody yet.</p>
              )}
            </div>
          );
        })}
      </div>

      <GrantDialog option={granting} onClose={() => setGranting(null)} />
    </Card>
  );
}

function GrantRow({ grant, onRevoke }: { grant: TrainingGrant; onRevoke: () => void }) {
  const name = grant.orgUser?.user?.name ?? grant.orgUser?.user?.email ?? `Member ${grant.orgUserId}`;
  return (
    <li className="flex items-center gap-2 rounded bg-muted/40 px-2 py-1.5 text-xs">
      <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        {name}
        {grant.course ? (
          <span className="text-muted-foreground"> · {grant.course.name}</span>
        ) : grant.courseId == null && grant.grant === "checkInstructor" ? (
          <span className="text-muted-foreground"> · every course</span>
        ) : null}
      </span>
      {grant.grantedBy?.user?.name ? (
        <span className="hidden text-muted-foreground sm:inline">by {grant.grantedBy.user.name}</span>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-1.5 text-muted-foreground hover:text-destructive"
        onClick={onRevoke}
        aria-label={`Revoke ${name}`}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </li>
  );
}

function GrantDialog({ option, onClose }: { option: TrainingGrantOption | null; onClose: () => void }) {
  const open = option != null;
  const people = useMembers(undefined, { enabled: open });
  const courses = useCourses(undefined, { enabled: open && (option?.courseScoped ?? false) });
  const create = useCreateTrainingGrant();

  const [orgUserId, setOrgUserId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("all");

  function close() {
    setOrgUserId("");
    setCourseId("all");
    create.reset();
    onClose();
  }

  //Who may be given this grant.
  //
  //The staff filter is right for the three grants that delegate staff work, and wrong for
  //`auditor`, which exists to hand an FAA inspector read-only access to every training
  //record. An inspector is not staff and should not have to be made one: giving somebody a
  //staff role to work around this picker grants far more than the read-only grant it was
  //standing in for, which is the opposite of what the grant is for.
  //
  //The server takes any member of the org for any grant, so the narrowing was ours alone.
  const staffOnly = option?.grant !== "auditor";
  const candidates = (people.data ?? []).filter(
    (p) =>
      !staffOnly ||
      rolesOf(p).some((r) => ["admin", "owner", "instructor", "dispatcher"].includes(r))
  );

  return (
    <ResponsiveModal
      open={open} onOpenChange={(o) => (o ? undefined : close())}
      title={option?.label}
      description={option?.description}
      footer={<><Button
            disabled={!orgUserId || create.isPending}
            onClick={async () => {
              await create.mutateAsync({
                orgUserId: Number(orgUserId),
                grant: option!.grant,
                courseId: option?.courseScoped && courseId !== "all" ? Number(courseId) : null,
              });
              close();
            }}
          >
            Grant
          </Button></>}
    >

        

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="grant-person">Who</Label>
            <Select value={orgUserId} onValueChange={setOrgUserId}>
              <SelectTrigger id="grant-person">
                <SelectValue placeholder="Pick someone" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.user?.name ?? p.user?.email ?? `Member ${p.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {candidates.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No instructors or administrators to choose from yet.
              </p>
            ) : null}
          </div>

          {option?.courseScoped ? (
            <div className="space-y-1">
              <Label htmlFor="grant-course">Which course</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="grant-course">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Every course</SelectItem>
                  {(courses.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                §141.37 designates a check instructor for a specific approved course. Pick that
                course unless this person really does check every one.
              </p>
            </div>
          ) : null}
        </div>

        {create.error ? (
          <p className="text-sm text-destructive">{(create.error as Error).message}</p>
        ) : null}
    </ResponsiveModal>
  );
}
