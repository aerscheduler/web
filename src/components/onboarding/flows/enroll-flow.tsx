/**
 * Enroll the first student on a published course.
 *
 * The step after "Set up a training course". Enrolling is what opens a training record,
 * and a record is what makes everything else in the module (grading at close-out, the
 * timeline, the hour ledger) show up, so it gets its own checklist item rather than being
 * left for an owner to find on the course page.
 *
 * Students first in the picker, staff after them: a CFI adding their own instrument rating
 * is enrolled too. With nobody to enroll yet, it hands over to inviting a student.
 */

import * as React from "react";
import { toast } from "sonner";
import { useCourses, useEnrollStudent, useMembers } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { rolesOf } from "@/types/api";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FlowClose, FlowDone, FlowModal, FlowNav, type FlowProps } from "./flow-shell";
import { InviteFlow } from "./invite-flow";

export function EnrollFlow({ onClose }: FlowProps) {
  const courses = useCourses();
  const members = useMembers();
  const enroll = useEnrollStudent();
  const { orgUserId: me } = useAuth();
  const [inviting, setInviting] = React.useState(false);
  const [versionId, setVersionId] = React.useState<string>("");
  const [student, setStudent] = React.useState<string>("");
  const [done, setDone] = React.useState<string | null>(null);

  // The newest published, unretired version of each live course: what a student is enrolled on.
  const options = (courses.data ?? [])
    .filter((c) => !c.archivedAt)
    .flatMap((c) => {
      const v = [...c.versions].reverse().find((x) => x.publishedAt && !x.retiredAt);
      return v ? [{ versionId: v.id, label: `${c.name} · ${v.label}` }] : [];
    });
  const pickedVersion = versionId || (options.length === 1 ? String(options[0].versionId) : "");

  const candidates = (members.data ?? [])
    .filter((m) => !m.archivedAt && m.id !== me)
    .sort((a, b) => {
      const aStudent = rolesOf(a).includes("student") ? 0 : 1;
      const bStudent = rolesOf(b).includes("student") ? 0 : 1;
      return aStudent - bStudent || (a.user?.name ?? "").localeCompare(b.user?.name ?? "");
    });

  if (inviting) return <InviteFlow onClose={onClose} defaultWho="student" />;

  async function save() {
    try {
      await enroll.mutateAsync({ versionId: Number(pickedVersion), orgUserId: Number(student) });
      const who = candidates.find((m) => String(m.id) === student);
      setDone(who?.user?.name ?? "Your student");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't enroll them");
    }
  }

  const loading = courses.isLoading || members.isLoading;
  const nobody = !loading && candidates.length === 0;
  const noCourse = !loading && options.length === 0;

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Enroll your first student"
      description="Enrolling opens their training record. Every lesson you grade from then on fills it in."
      footer={
        done ? (
          <FlowClose onClose={onClose} />
        ) : nobody ? (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Not now
            </Button>
            <Button onClick={() => setInviting(true)}>Invite a student</Button>
          </div>
        ) : (
          <FlowNav
            onNext={save}
            nextLabel="Enroll"
            nextDisabled={!pickedVersion || !student || noCourse}
            busy={enroll.isPending}
            onSkip={onClose}
            skipLabel="Cancel"
          />
        )
      }
    >
      {done ? (
        <FlowDone
          headline={`${done} is enrolled.`}
          body="Grade their lessons at close-out, or from their record under Training. Their timeline fills in as you sign."
        />
      ) : loading ? (
        <Skeleton className="h-28 w-full" />
      ) : noCourse ? (
        <p className="text-sm text-muted-foreground">Publish a course first: set one up from the step above, then come back here.</p>
      ) : nobody ? (
        <p className="text-sm text-muted-foreground">
          Nobody else is in your organization yet. Invite your student, and enroll them once they have joined.
        </p>
      ) : (
        <div className="space-y-4">
          {options.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="ef-course">Course</Label>
              <Select value={pickedVersion} onValueChange={setVersionId}>
                <SelectTrigger id="ef-course">
                  <SelectValue placeholder="Choose a course" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.versionId} value={String(o.versionId)}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="ef-student">Student</Label>
            <Select value={student} onValueChange={setStudent}>
              <SelectTrigger id="ef-student">
                <SelectValue placeholder="Choose a member" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.user?.name ?? m.user?.email ?? `Member ${m.id}`}
                    {rolesOf(m).includes("student") ? "" : " (staff)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </FlowModal>
  );
}
