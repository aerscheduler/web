import { useMemo, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { GrantOption, MemberPermissions } from "@/types/api";
import {
  useGrantPermission,
  useMemberPermissions,
  usePermissionCatalog,
  useRevokePermission,
} from "@/features/queries";
import { ListSearchBar, type FacetDef, type ListFilterValues } from "@/components/list-filters";
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
 * question somebody actually asks, most often on the day they leave. An answer spread
 * across six settings screens is not an answer.
 *
 * EVERY ROW IS IN ONE OF THREE STATES, and they have to LOOK different, not merely read
 * differently. An earlier version gave two of them the same disabled switch with almost
 * the same words beside it ("from instructor" against "comes with the role"), which reads
 * as one state with inconsistent copy:
 *
 *   GIVEN      a real switch. Yours to turn on and off.
 *   FROM ROLE  a switch locked on, with the role named. It cannot be removed here because
 *              nothing here can take away what a role confers; remove the role instead.
 *   NOT YET    no switch, and a badge naming the roles that DO carry it. A dead control
 *              looks like a locked one, and this state is not "locked", it is "not
 *              offered": the server does not consult grants for it yet, so giving it to
 *              one person would hand them a capability every route behind it refuses.
 *              Naming the roles answers the question the reader actually has, which is
 *              "then how does somebody get this", and "Comes with the role" did not:
 *              it named no role, and on a person whose own roles do not carry it, it
 *              read as a statement about them that was not true.
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
    <PermissionsBody orgUserId={orgUserId} catalog={catalog.data} permissions={permissions.data} />
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
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<ListFilterValues>({});

  const held = new Set(permissions.granted);
  const rowByGrant = new Map(
    permissions.rows.filter((r) => r.courseId == null).map((r) => [r.grant, r])
  );
  /** Course-scoped rows, keyed by grant, so they show against the grant they scope. */
  const scopedFor = (g: string) => permissions.scoped.filter((s) => s.grant === g);
  const impliedFor = (option: GrantOption) =>
    option.impliedBy.filter((r) => permissions.roles.includes(r));

  /** The row's state, decided once so the badge and the control cannot disagree. */
  function stateOf(option: GrantOption): "given" | "fromRole" | "notYet" {
    if (impliedFor(option).length > 0) return "fromRole";
    if (!option.enforced) return "notYet";
    return "given";
  }

  const facets: FacetDef[] = useMemo(() => {
    const domains: Array<{ value: string; label: string }> = [];
    for (const o of catalog) {
      if (!domains.some((d) => d.value === o.domain)) {
        domains.push({ value: o.domain, label: o.domainLabel });
      }
    }
    return [
      { kind: "select", key: "domain", label: "Group", options: domains, multiple: true },
      { kind: "boolean", key: "held", label: "Holds it", trueLabel: "Held", falseLabel: "Not held" },
      {
        kind: "boolean",
        key: "assignable",
        label: "Can be given",
        trueLabel: "Can be given",
        falseLabel: "Comes with the role",
      },
    ];
  }, [catalog]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const wantDomains = Array.isArray(filters.domain) ? filters.domain : [];
    return catalog.filter((o) => {
      if (wantDomains.length && !wantDomains.includes(o.domain)) return false;
      if (filters.held === true && !held.has(o.grant)) return false;
      if (filters.held === false && held.has(o.grant)) return false;
      // "Can be given" is the honest question a reader has: which of these is a switch?
      if (filters.assignable === true && stateOf(o) !== "given") return false;
      if (filters.assignable === false && stateOf(o) === "given") return false;
      if (!q) return true;
      return (
        o.label.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q) ||
        o.grant.toLowerCase().includes(q) ||
        o.domainLabel.toLowerCase().includes(q)
      );
    });
  }, [catalog, search, filters, permissions]);

  const domains = useMemo(() => {
    const order: string[] = [];
    const byDomain = new Map<string, { label: string; options: GrantOption[] }>();
    for (const option of visible) {
      if (!byDomain.has(option.domain)) {
        byDomain.set(option.domain, { label: option.domainLabel, options: [] });
        order.push(option.domain);
      }
      byDomain.get(option.domain)!.options.push(option);
    }
    return order.map((d) => ({ domain: d, ...byDomain.get(d)! }));
  }, [visible]);

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
   * Anything reaching money, or handing out authority, confirms first. Not because it is
   * hard to reverse, it is one click back, but because the consequence is invisible from
   * this screen: nothing here shows that "See revenue reports" tells a part-time
   * bookkeeper what every CFI on staff earns.
   */
  const needsConfirming = (o: GrantOption) => o.domain === "financial" || o.grant === "assignRoles";

  return (
    // Controls fixed, rows scrolling beneath: the shape `panelClass` uses on Facilities.
    // A search box that scrolls away from the list it filters is worse than none.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      <ListSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search permissions…"
        aria-label="Search permissions"
        facets={facets}
        filterValues={filters}
        onFilterChange={setFilters}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      {domains.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nothing matches that.
        </Card>
      ) : (
        domains.map(({ domain, label, options }) => (
          <Card key={domain} className="p-4" data-doc-shot={`person-permissions-${domain}`}>
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-medium">{label}</h2>
            </div>
            <ul className="flex flex-col divide-y">
              {options.map((option) => {
                const state = stateOf(option);
                const implied = impliedFor(option);
                const scoped = scopedFor(option.grant);
                const busy = pending === option.grant;
                return (
                  <li
                    key={option.grant}
                    className="flex items-start gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{option.label}</span>
                        {state === "fromRole" && (
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            from {implied.join(", ")}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </p>
                      {/* The course-scoped designation belongs against the grant it scopes,
                          not in a section of its own. A card headed "Held for one course
                          only" made one grant look like a separate kind of thing. */}
                      {scoped.length > 0 && (
                        <p className="mt-1.5 text-xs">
                          <span className="text-muted-foreground">For one course only: </span>
                          {scoped
                            .map((s) => s.courseName ?? `Course #${s.courseId}`)
                            .join(", ")}
                          <span className="text-muted-foreground"> · set in Training</span>
                        </p>
                      )}
                    </div>

                    {state === "fromRole" ? (
                      <Switch checked disabled aria-label={`${option.label}, from their role`} />
                    ) : state === "notYet" ? (
                      <div className="flex shrink-0 flex-wrap justify-end gap-1 pt-0.5">
                        {option.impliedBy.length === 0 ? (
                          <Badge variant="outline" className="text-[10px]">
                            Not yet available
                          </Badge>
                        ) : (
                          option.impliedBy.map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px] capitalize">
                              {r}
                            </Badge>
                          ))
                        )}
                      </div>
                    ) : (
                      <Switch
                        checked={held.has(option.grant)}
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
        ))
      )}
      </div>

      <Dialog open={confirming != null} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
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
