import { useState } from "react";
import { Receipt } from "lucide-react";
import type { Course } from "@/types/api";
import { useUpdateCourse } from "@/features/queries";
import { formatMoney } from "@/lib/utils";
import { DocsHint } from "@/components/docs-hint";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Invoice line names are VarChar(60); the server refuses anything longer. */
const LABEL_MAX = 60;

/**
 * What the school charges to enroll on this course.
 *
 * Editable even after the syllabus is published, unlike everything else on this page. A
 * price is a commercial decision, not part of the document filed with the FSDO — and it is
 * safe here because each enrollment stores its own snapshot of the fee, so changing it
 * cannot re-price anybody already training.
 *
 * Entered in dollars and stored in cents. The conversion is the only interesting thing in
 * this file: `parseFloat("499.99") * 100` is 49998.99999999999 in IEEE 754, so it is
 * rounded rather than truncated. Truncating would undercharge by a cent on a large
 * fraction of real prices, forever, and nobody would ever find it.
 */
export function CourseFeeEditor({ course }: { course: Course }) {
  const update = useUpdateCourse();
  const [dollars, setDollars] = useState(
    course.enrollmentFeeCents != null ? (course.enrollmentFeeCents / 100).toFixed(2) : ""
  );
  const [label, setLabel] = useState(course.enrollmentFeeLabel ?? "");

  const trimmed = dollars.trim();
  const parsed = trimmed === "" ? null : Number.parseFloat(trimmed);
  const cents = parsed == null ? null : Math.round(parsed * 100);

  const invalid =
    parsed != null && (!Number.isFinite(parsed) || parsed <= 0);
  const dirty =
    cents !== (course.enrollmentFeeCents ?? null) ||
    label.trim() !== (course.enrollmentFeeLabel ?? "");

  return (
    <Card className="p-4" data-doc-shot="course-enrollment-fee-card">
      <div className="mb-1 flex items-center gap-2">
        <Receipt className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Enrollment fee</h2>
        <DocsHint topic="enrollment-fee" />
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        What a student pays to start this course. Leave it empty if the course is free.
        Students already enrolled keep the price they signed up at.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="fee-amount">Amount</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="fee-amount"
              className="w-36 pl-5"
              inputMode="decimal"
              placeholder="0.00"
              value={dollars}
              onChange={(e) => setDollars(e.target.value)}
            />
          </div>
        </div>

        <div className="min-w-[16rem] flex-1 space-y-1">
          <Label htmlFor="fee-label">How it reads on the invoice</Label>
          <Input
            id="fee-label"
            maxLength={LABEL_MAX}
            placeholder={`${course.name} enrollment fee`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <Button
          disabled={!dirty || invalid || update.isPending}
          onClick={() =>
            update.mutate({
              courseId: course.id,
              enrollmentFeeCents: cents,
              enrollmentFeeLabel: label.trim() || null,
            })
          }
        >
          Save
        </Button>
      </div>

      {invalid ? (
        <p className="mt-2 text-sm text-destructive">
          A fee has to be more than zero. Leave it empty for a free course.
        </p>
      ) : cents != null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Enrolling a student will record {formatMoney(cents)} owed, billable in one click
          from their record.
        </p>
      ) : null}

      {update.error ? (
        <p className="mt-2 text-sm text-destructive">{(update.error as Error).message}</p>
      ) : null}
    </Card>
  );
}
