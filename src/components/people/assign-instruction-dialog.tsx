import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { OrganizationUser } from "@/types/api";
import {
  useAssignInstructionPair,
  useMembers,
  useUnassignInstructionPair,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { Combobox } from "@/components/combobox";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { memberName } from "./util";

type Mode = "assignStudent" | "assignInstructor" | "unassignStudent" | "unassignInstructor";

function modeCopy(mode: Mode, subjectName: string) {
  switch (mode) {
    case "assignStudent":
      return {
        title: "Assign student",
        description: `Pick a student to pair with ${subjectName}.`,
        label: "Student",
        search: "Search students…",
        empty: "No students left to assign.",
        confirm: "Assign",
      };
    case "assignInstructor":
      return {
        title: "Assign instructor",
        description: `Pick an instructor to pair with ${subjectName}.`,
        label: "Instructor",
        search: "Search instructors…",
        empty: "No instructors left to assign.",
        confirm: "Assign",
      };
    case "unassignStudent":
      return {
        title: "Unassign student",
        description: `Remove a student from ${subjectName}.`,
        label: "Student",
        search: "Search students…",
        empty: "No students assigned.",
        confirm: "Unassign",
      };
    case "unassignInstructor":
      return {
        title: "Unassign instructor",
        description: `Remove an instructor from ${subjectName}.`,
        label: "Instructor",
        search: "Search instructors…",
        empty: "No instructors assigned.",
        confirm: "Unassign",
      };
  }
}

/**
 * Admin assign / unassign dialog. Role-table ids:
 * - subjectInstructorId / subjectStudentId: the person on the profile sheet
 * - pick list uses the opposite role from useMembers + already-paired filter
 */
export function AssignInstructionDialog({
  open,
  onOpenChange,
  mode,
  subject,
  subjectInstructorId,
  subjectStudentId,
  assignedRoleIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: Mode | null;
  subject: OrganizationUser | null;
  /** Instructor role PK when the sheet person is (or includes) an instructor. */
  subjectInstructorId: number | null;
  /** Student role PK when the sheet person is (or includes) a student. */
  subjectStudentId: number | null;
  /** Role ids already paired (students of this instructor, or instructors of this student). */
  assignedRoleIds: number[];
}) {
  const [picked, setPicked] = useState<string>("");
  const assign = useAssignInstructionPair();
  const unassign = useUnassignInstructionPair();

  const needStudents = mode === "assignStudent" || mode === "unassignStudent";
  const needInstructors = mode === "assignInstructor" || mode === "unassignInstructor";

  const studentsQ = useMembers({ student: true }, { enabled: open && needStudents });
  const instructorsQ = useMembers({ instructor: true }, { enabled: open && needInstructors });

  const assigned = useMemo(() => new Set(assignedRoleIds), [assignedRoleIds]);

  const options = useMemo(() => {
    if (!mode || !subject) return [];
    if (needStudents) {
      const list = studentsQ.data ?? [];
      return list
        .filter((ou) => {
          const sid = ou.studentRole?.id;
          if (sid == null) return false;
          if (ou.id === subject.id) return false;
          if (mode === "assignStudent") return !assigned.has(sid);
          return assigned.has(sid);
        })
        .map((ou) => ({
          value: String(ou.studentRole!.id),
          label: memberName(ou),
          hint: ou.user?.email ?? undefined,
        }));
    }
    const list = instructorsQ.data ?? [];
    return list
      .filter((ou) => {
        const iid = ou.instructorRole?.id;
        if (iid == null) return false;
        if (ou.id === subject.id) return false;
        if (mode === "assignInstructor") return !assigned.has(iid);
        return assigned.has(iid);
      })
      .map((ou) => ({
        value: String(ou.instructorRole!.id),
        label: memberName(ou),
        hint: ou.user?.email ?? undefined,
      }));
  }, [mode, subject, needStudents, studentsQ.data, instructorsQ.data, assigned]);

  if (!mode || !subject) return null;
  const copy = modeCopy(mode, memberName(subject));
  const busy = assign.isPending || unassign.isPending;

  async function submit() {
    if (!mode || !subject || !picked) return;
    const otherId = Number(picked);
    let studentId: number;
    let instructorId: number;

    if (mode === "assignStudent" || mode === "unassignStudent") {
      if (subjectInstructorId == null) return;
      instructorId = subjectInstructorId;
      studentId = otherId;
    } else {
      if (subjectStudentId == null) return;
      studentId = subjectStudentId;
      instructorId = otherId;
    }

    try {
      if (mode.startsWith("assign")) {
        await assign.mutateAsync({ studentId, instructorId });
        toast.success("Assignment saved.");
      } else {
        await unassign.mutateAsync({ studentId, instructorId });
        toast.success("Assignment removed.");
      }
      setPicked("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update the assignment.");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicked("");
        onOpenChange(next);
      }}
      title={copy.title}
      description={copy.description}
    >
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>{copy.label}</Label>
          <Combobox
            options={options}
            value={picked || undefined}
            onChange={setPicked}
            placeholder={`Select ${copy.label.toLowerCase()}…`}
            searchPlaceholder={copy.search}
            emptyText={copy.empty}
            disabled={busy}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !picked}>
            {busy ? "Saving…" : copy.confirm}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}

export type AssignInstructionMode = Mode;
