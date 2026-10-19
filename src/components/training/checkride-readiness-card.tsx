/**
 * The checklist a chief instructor runs before sending a student to the examiner, built
 * from what the record already knows. See lib/checkride-readiness.ts for the rules.
 */

import { Check, Circle, Info } from "lucide-react";
import { useEndorsements } from "@/features/queries";
import { checkrideReadiness, type ReadinessItem } from "@/lib/checkride-readiness";
import type { EnrollmentProgress } from "@/types/api";
import { Card } from "@/components/ui/card";
import { DocsHint } from "@/components/docs-hint";

export function CheckrideReadinessCard({
  progress,
  self = false,
  bare = false,
}: {
  progress: EnrollmentProgress;
  /** The student reading their own record. */
  self?: boolean;
  /** Inside another card (My training): a section, not a card of its own. */
  bare?: boolean;
}) {
  const e = progress.enrollment;
  const endorsements = useEndorsements({ orgUserId: e.studentOrgUserId });
  if (e.status !== "enrolled" || endorsements.isPending) return null;

  const r = checkrideReadiness(
    {
      standings: progress.standings,
      lessonsComplete: progress.lessonsComplete,
      lessonsTotal: progress.lessonsTotal,
      certificateSought: e.courseVersion.course.certificateSought,
    },
    endorsements.data ?? []
  );
  if (!r) return null;
  const left = r.items.filter((i) => i.state === "missing").length;

  const Shell = bare ? "section" : Card;
  return (
    <Shell className={bare ? "border-t pt-4" : "p-4"} data-track="Checkride readiness">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          Checkride readiness
          <DocsHint topic="checkride-readiness" />
        </span>
        <span className="text-sm text-muted-foreground">
          {r.ready ? (self ? "You're ready to test" : "Ready to test") : `${left} to go`}
        </span>
      </div>
      <ul className="space-y-2.5">
        {r.items.map((i) => (
          <Row key={i.key} item={i} />
        ))}
      </ul>
    </Shell>
  );
}

function Row({ item }: { item: ReadinessItem }) {
  const Icon = item.state === "done" ? Check : item.state === "advisory" ? Info : Circle;
  return (
    <li className="flex items-start gap-2.5">
      <Icon
        className={
          "mt-0.5 size-4 shrink-0 " + (item.state === "done" ? "text-success" : "text-muted-foreground")
        }
        aria-hidden
      />
      <div className="min-w-0">
        <div className={"text-sm " + (item.state === "done" ? "text-muted-foreground" : "font-medium")}>{item.label}</div>
        <div className="text-xs text-muted-foreground">{item.detail}</div>
      </div>
    </li>
  );
}
