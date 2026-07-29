import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useAssignInstructionPair, useMembers } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { Combobox } from "@/components/combobox";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { memberName } from "./util";

/**
 * Admin/owner assigns any instructor ↔ student pair from People (both sides
 * chosen here). Profile-sheet assign stays for when you're already looking at one person.
 */
export function AdminAssignPairDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [instructorRoleId, setInstructorRoleId] = useState("");
  const [studentRoleId, setStudentRoleId] = useState("");
  const assign = useAssignInstructionPair();

  const instructorsQ = useMembers({ instructor: true }, { enabled: open });
  const studentsQ = useMembers({ student: true }, { enabled: open });

  const instructorOptions = useMemo(
    () =>
      (instructorsQ.data ?? [])
        .filter((ou) => ou.instructorRole?.id != null)
        .map((ou) => ({
          value: String(ou.instructorRole!.id),
          label: memberName(ou),
          hint: ou.user?.email ?? undefined,
        })),
    [instructorsQ.data]
  );

  const studentOptions = useMemo(
    () =>
      (studentsQ.data ?? [])
        .filter((ou) => ou.studentRole?.id != null)
        .map((ou) => ({
          value: String(ou.studentRole!.id),
          label: memberName(ou),
          hint: ou.user?.email ?? undefined,
        })),
    [studentsQ.data]
  );

  function reset() {
    setInstructorRoleId("");
    setStudentRoleId("");
  }

  async function submit() {
    if (!instructorRoleId || !studentRoleId) return;
    try {
      await assign.mutateAsync({
        instructorId: Number(instructorRoleId),
        studentId: Number(studentRoleId),
      });
      toast.success("Student assigned to instructor.");
      reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't create the assignment.");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
      title="Assign instruction pair"
      description="Pick an instructor and a student to pair for dual bookings. You can also do this from either person's profile."
    >
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>Instructor</Label>
          <Combobox
            options={instructorOptions}
            value={instructorRoleId || undefined}
            onChange={setInstructorRoleId}
            placeholder="Select instructor…"
            searchPlaceholder="Search instructors…"
            emptyText="No instructors in this school yet."
            disabled={assign.isPending}
          />
        </div>
        <div className="grid gap-2">
          <Label>Student</Label>
          <Combobox
            options={studentOptions}
            value={studentRoleId || undefined}
            onChange={setStudentRoleId}
            placeholder="Select student…"
            searchPlaceholder="Search students…"
            emptyText="No students in this school yet."
            disabled={assign.isPending}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assign.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={assign.isPending || !instructorRoleId || !studentRoleId}
          >
            {assign.isPending ? "Saving…" : "Assign"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
