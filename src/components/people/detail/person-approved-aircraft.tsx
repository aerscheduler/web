import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { PlaneTakeoff } from "lucide-react";
import { resourceLabel, type Resource } from "@/types/api";
import {
  useApproveResource,
  useApprovedResources,
  usePlanes,
  useSimulators,
} from "@/features/queries";
import { DocsHint } from "@/components/docs-hint";
import {
  CardEmpty,
  CardSkeleton,
  DetailCard,
} from "@/components/detail/detail-page";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Which tails (and simulators) this person is checked out on.
 *
 * Empty is a real answer for a student who only ever flies dual, so it says so
 * rather than looking like a failed load. Admins flip switches in place, the
 * same write as Aircraft → Approve members, so you do not have to leave the
 * person's record to check them out.
 */
export function PersonApprovedAircraft({
  userId,
  isSelf,
  canManage,
}: {
  userId: number | null;
  isSelf: boolean;
  canManage: boolean;
}) {
  const approvedQ = useApprovedResources(userId);
  const planesQ = usePlanes(undefined, { enabled: canManage });
  const simsQ = useSimulators(undefined, { enabled: canManage });
  const approve = useApproveResource();

  const [overrides, setOverrides] = useState<Record<number, boolean>>({});

  const approvedIds = useMemo(() => {
    const ids = new Set((approvedQ.data ?? []).map((r) => r.id));
    for (const [id, on] of Object.entries(overrides)) {
      const n = Number(id);
      if (on) ids.add(n);
      else ids.delete(n);
    }
    return ids;
  }, [approvedQ.data, overrides]);

  const fleet = useMemo(() => {
    const rows = [...(planesQ.data ?? []), ...(simsQ.data ?? [])].filter(
      (r) => r.type?.room == null
    );
    rows.sort((a, b) => resourceLabel(a).name.localeCompare(resourceLabel(b).name));
    return rows;
  }, [planesQ.data, simsQ.data]);

  const approvedOnly = useMemo(
    () => (approvedQ.data ?? []).filter((r) => r.type?.room == null),
    [approvedQ.data]
  );

  function toggle(resource: Resource, next: boolean) {
    if (userId == null) return;
    const { name } = resourceLabel(resource);
    setOverrides((prev) => ({ ...prev, [resource.id]: next }));
    approve.mutate(
      { resourceId: resource.id, userId, approve: next },
      {
        onSuccess: () =>
          toast.success(
            next ? `Approved for ${name}` : `Removed from ${name}`
          ),
        onError: (err) => {
          setOverrides((prev) => ({ ...prev, [resource.id]: !next }));
          toast.error(err instanceof Error ? err.message : "Couldn't update approval");
        },
      }
    );
  }

  const title = (
    <span className="inline-flex items-center gap-1.5">
      Approved aircraft
      <DocsHint topic="approve-members" />
    </span>
  );

  const description = canManage
    ? "Tails they're checked out to fly. Flip a switch to approve or remove, it saves immediately."
    : isSelf
      ? "Tails you're checked out to fly."
      : "Tails they're checked out to fly.";

  if (canManage) {
    const loading = approvedQ.isPending || planesQ.isPending || simsQ.isPending;
    const failed = approvedQ.isError || planesQ.isError || simsQ.isError;
    return (
      <DetailCard title={title} description={description}>
        {loading ? (
          <CardSkeleton rows={3} />
        ) : failed ? (
          <CardEmpty>Couldn&apos;t load approvals.</CardEmpty>
        ) : fleet.length === 0 ? (
          <CardEmpty>
            No aircraft or simulators yet. Add one from{" "}
            <Link to="/aircraft" className="underline underline-offset-2">
              Aircraft
            </Link>
            .
          </CardEmpty>
        ) : (
          <ul className="divide-y divide-border">
            {fleet.map((r) => {
              const { name, kind } = resourceLabel(r);
              const isOn = approvedIds.has(r.id);
              return (
                <li key={r.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm">{name}</div>
                    {kind !== "Aircraft" && (
                      <div className="text-xs text-muted-foreground">{kind}</div>
                    )}
                  </div>
                  <Label htmlFor={`approve-res-${r.id}`} className="sr-only">
                    Approve for {name}
                  </Label>
                  <Switch
                    id={`approve-res-${r.id}`}
                    checked={isOn}
                    onCheckedChange={(v) => toggle(r, v)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </DetailCard>
    );
  }

  return (
    <DetailCard title={title} description={description}>
      {approvedQ.isPending ? (
        <CardSkeleton rows={2} />
      ) : approvedQ.isError ? (
        <CardEmpty>Couldn&apos;t load approvals.</CardEmpty>
      ) : approvedOnly.length === 0 ? (
        <CardEmpty>
          No aircraft approved{isSelf ? " for you" : ""} yet, an admin grants
          this per tail from the aircraft page or here on the profile.
        </CardEmpty>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {approvedOnly.map((r) => {
            const { name } = resourceLabel(r);
            return (
              <li key={r.id}>
                {r.type?.plane ? (
                  <Link
                    to="/aircraft/$resourceId"
                    params={{ resourceId: String(r.id) }}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-xs transition-colors hover:bg-accent/50"
                  >
                    <PlaneTakeoff className="size-3.5 opacity-70" />
                    {name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 font-mono text-xs">
                    <PlaneTakeoff className="size-3.5 opacity-70" />
                    {name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DetailCard>
  );
}
