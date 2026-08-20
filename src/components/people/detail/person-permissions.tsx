import { useMemo, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { GrantOption, MemberPermissions } from "@/types/api";
import {
  useGrantPermission,
  useMemberPermissions,
  usePermissionCatalog,
  useRevokePermission,
} from "@/features/queries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * What this person may do, and the one place to change it.
 *
 * It lives on the PERSON rather than scattered through the product because that is the
 * question somebody actually asks: "what can Sarah do here", most often on the day she
 * leaves. An answer spread across six settings screens is not an answer.
 *
 * TWO KINDS OF THING ARE ON SCREEN AND THEY BEHAVE DIFFERENTLY.
 *
 * Roles are shown but not edited here. A role says what somebody IS to the school and
 * carries data with it: the instructor row anchors their students and their ratings, the
 * renter row decides which seat they may take on a booking. Changing that is a different
 * decision, made in the Roles editor, and mixing the two would suggest you could tick
 * "instructor" to grant a capability.
 *
 * Grants are what this screen is for. Every one is ADDITIVE: nothing here can take away
 * something a role already confers, which is why a capability that comes with the role is
 * shown fixed on rather than as an unticked box somebody would try to use to remove it.
 */
export function PersonPermissions({ orgUserId }: { orgUserId: number }) {
  const catalog = usePermissionCatalog();
  const permissions = useMemberPermissions(orgUserId);

  if (catalog.isPending || permissions.isPending) {
    return (
      <Card className="flex items-center justify-center p-10">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </Card>
    );
  }
  if (!catalog.data || !permissions.data) return null;

  return (
    <PermissionsBody
      orgUserId={orgUserId}
      catalog={catalog.data}
      permissions={permissions.data}
    />
  );
}

function PermissionsBody({
  orgUserId,
  catalog,
  permissions,
}: {
  orgUserId: number;
  catalog: GrantOption[];
  permissions: MemberPermissions;
}) {
  const grant = useGrantPermission(orgUserId);
  const revoke = useRevokePermission(orgUserId);
  const [confirming, setConfirming] = useState<GrantOption | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const held = new Set(permissions.granted);
  const rowByGrant = new Map(permissions.rows.filter((r) => r.courseId == null).map((r) => [r.grant, r]));

  /** Which roles this person holds that confer a given grant. Empty means it was given. */
  const impliedFor = (option: GrantOption) =>
    option.impliedBy.filter((r) => permissions.roles.includes(r));

  const domains = useMemo(() => {
    const order: string[] = [];
    const byDomain = new Map<string, { label: string; options: GrantOption[] }>();
    for (const option of catalog) {
      if (!byDomain.has(option.domain)) {
        byDomain.set(option.domain, { label: option.domainLabel, options: [] });
        order.push(option.domain);
      }
      byDomain.get(option.domain)!.options.push(option);
    }
    return order.map((d) => ({ domain: d, ...byDomain.get(d)! }));
  }, [catalog]);

  async function toggle(option: GrantOption, next: boolean) {
    setPending(option.grant);
    try {
      if (next) {
        await grant.mutateAsync({ grant: option.grant });
        toast.success(`${option.label} given`);
      } else {
        const row = rowByGrant.get(option.grant);
        if (!row) return;
        await revoke.mutateAsync(row.id);
        toast.success(`${option.label} taken back`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setPending(null);
    }
  }

  /**
   * Anything that lets somebody reach money, or hand out authority, gets a confirmation.
   * Not because the action is hard to reverse, it is one click back, but because the
   * consequence is invisible from this screen: nothing here shows you that ticking
   * "See revenue reports" is what tells a part-time bookkeeper what every CFI earns.
   */
  const needsConfirming = (option: GrantOption) =>
    option.domain === "financial" || option.grant === "assignRoles";

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Roles</h2>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          What this person is to the school. Roles carry their own data, a student roster, a
          rating, which seat they take on a booking, so they are changed in the Roles editor
          rather than here.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {permissions.roles.length === 0 ? (
            <span className="text-xs text-muted-foreground">No roles yet.</span>
          ) : (
            permissions.roles.map((r) => (
              <Badge key={r} variant="secondary" className="capitalize">
                {r}
              </Badge>
            ))
          )}
        </div>
      </Card>

      {permissions.scoped.length > 0 && (
        <Card className="p-4">
          <h2 className="mb-1 text-sm font-medium">Held for one course only</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            A check-instructor designation applies to the course it names and no other,
            which is what Part 141 §141.37 asks for. Set these in Training.
          </p>
          <ul className="flex flex-col gap-1.5">
            {permissions.scoped.map((held) => (
              <li key={`${held.grant}-${held.courseId}`} className="flex items-center gap-2">
                <Badge variant="outline">
                  {catalog.find((o) => o.grant === held.grant)?.label ?? held.grant}
                </Badge>
                {/* Naming the course is the whole point of a scoped designation: "check
                    instructor" with no course tells an administrator nothing about what
                    this person may actually sign. */}
                <span className="text-xs text-muted-foreground">
                  {/* The server sends the name with the row, so neither client has to
                      fetch the course list to answer "which course". */}
                  {held.courseName ?? `Course #${held.courseId}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="px-1 text-xs text-muted-foreground">
        Permissions marked <span className="font-medium">comes with the role</span> cannot be
        given to one person yet. Change their roles for those.
      </p>

      {domains.map(({ domain, label, options }) => (
        <Card key={domain} className="p-4" data-doc-shot={`person-permissions-${domain}`}>
          <div className="mb-3 flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">{label}</h2>
          </div>
          <ul className="flex flex-col divide-y">
            {options.map((option) => {
              const implied = impliedFor(option);
              const on = held.has(option.grant);
              const busy = pending === option.grant;
              return (
                <li key={option.grant} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      {implied.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] capitalize">
                          from {implied.join(", ")}
                        </Badge>
                      )}
                      {option.courseScoped && (
                        <Badge variant="outline" className="text-[10px]">
                          per course
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {option.description}
                    </p>
                  </div>
                  {option.courseScoped ? (
                    <span className="shrink-0 pt-0.5 text-xs text-muted-foreground">
                      Set in Training
                    </span>
                  ) : implied.length > 0 ? (
                    // Fixed on, not an unticked box: this cannot be removed here, and
                    // offering a control that refuses to move is worse than not offering one.
                    <Switch checked disabled aria-label={`${option.label}, from their role`} />
                  ) : !option.enforced ? (
                    // The server does not consult the Grant table for this one yet, so
                    // issuing it would hand somebody a capability every route behind it
                    // still refuses. Offered as read-only until enforcement lands, rather
                    // than as a switch that produces a 403 for whoever was given it.
                    <Switch checked={on} disabled aria-label={`${option.label}, comes with the role`} />
                  ) : (
                    <Switch
                      checked={on}
                      disabled={busy}
                      aria-label={option.label}
                      onCheckedChange={(next) => {
                        if (next && needsConfirming(option)) setConfirming(option);
                        else void toggle(option, next);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}

      <Dialog open={confirming != null} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            {/* The permission's own name is the title. Folding it into a sentence read as
                "Give see invoices and balances?", which is the copy you get from
                concatenating a label rather than writing one. */}
            <DialogTitle>{confirming?.label}</DialogTitle>
            <DialogDescription>{confirming?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const option = confirming;
                setConfirming(null);
                if (option) void toggle(option, true);
              }}
            >
              Give it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
