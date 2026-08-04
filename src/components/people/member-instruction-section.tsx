import { useState } from "react";
import { toast } from "sonner";
import { UserMinus, UserPlus } from "lucide-react";
import type { AssignedPerson, OrganizationUser } from "@/types/api";
import {
  useRequestInstructor,
  useRequestStudent,
  useUnassignSelfAsInstructor,
  useUnassignSelfAsStudent,
  useUserInstructionPartners,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isInstructor, isStudent } from "@/lib/permissions";
import { useConfirm } from "@/components/confirm-dialog";
import {
  AssignInstructionDialog,
  type AssignInstructionMode,
} from "@/components/people/assign-instruction-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, initials } from "@/lib/utils";
import { memberName } from "./util";

/**
 * Instruction pairs on a People profile — admin assign/unassign, plus
 * instructor/student request & self-remove (Flutter personnel detail menu).
 *
 * `bare` drops the divider it grew for the old profile drawer, where it was one
 * block in a scrolling stack. On the profile page it is its own card and the
 * top border would read as a second, empty header.
 */
export function MemberInstructionSection({
  ou,
  bare,
}: {
  ou: OrganizationUser;
  bare?: boolean;
}) {
  const { isAdmin, roles, userId, membership } = useAuth();
  const confirm = useConfirm();
  const targetUserId = ou.user?.id ?? null;
  const partners = useUserInstructionPartners(targetUserId, {
    enabled: targetUserId != null,
  });

  const [dialogMode, setDialogMode] = useState<AssignInstructionMode | null>(null);

  const myInstructorId = membership?.instructorRole?.id ?? null;
  const myStudentId = membership?.studentRole?.id ?? null;
  const amInstructor = isInstructor(roles);
  const amStudent = isStudent(roles);
  const viewingSelf = targetUserId != null && targetUserId === userId;

  const subjectInstructorId =
    partners.data?.instructorRoleId ?? ou.instructorRole?.id ?? null;
  const subjectStudentId =
    partners.data?.studentRoleId ?? ou.studentRole?.id ?? null;

  const students = partners.data?.students ?? [];
  const instructors = partners.data?.instructors ?? [];

  // Viewing a student: paired if I'm among their instructors.
  const alreadyPairedAsTheirInstructor =
    myInstructorId != null && instructors.some((i) => i.id === myInstructorId);
  // Viewing an instructor: paired if I'm among their students.
  const alreadyPairedAsTheirStudent =
    myStudentId != null && students.some((s) => s.id === myStudentId);

  const requestInstructor = useRequestInstructor();
  const requestStudent = useRequestStudent();
  const unassignSelfStudent = useUnassignSelfAsStudent();
  const unassignSelfInstructor = useUnassignSelfAsInstructor();

  const showInstructorBlock = subjectInstructorId != null;
  const showStudentBlock = subjectStudentId != null;

  // Nothing instruction-related to show: plain members for non-admins. Admins
  // still see a hint about Edit roles / Assign pair.
  if (!showInstructorBlock && !showStudentBlock && !isAdmin) {
    return null;
  }

  const assignedForDialog =
    dialogMode === "assignStudent" || dialogMode === "unassignStudent"
      ? students.map((s) => s.id)
      : instructors.map((i) => i.id);

  return (
    <div className={cn("px-4 py-4", !bare && "border-t border-border")}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold leading-none tracking-tight">Instruction</h3>
        {isAdmin && (showInstructorBlock || showStudentBlock) && (
          <div className="flex flex-wrap gap-1.5">
            {showInstructorBlock && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogMode("assignStudent")}
                >
                  <UserPlus className="size-4" /> Assign student
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={students.length === 0}
                  onClick={() => setDialogMode("unassignStudent")}
                >
                  <UserMinus className="size-4" /> Unassign student
                </Button>
              </>
            )}
            {showStudentBlock && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDialogMode("assignInstructor")}
                >
                  <UserPlus className="size-4" /> Assign instructor
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={instructors.length === 0}
                  onClick={() => setDialogMode("unassignInstructor")}
                >
                  <UserMinus className="size-4" /> Unassign instructor
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!showInstructorBlock && !showStudentBlock && isAdmin ? (
        <p className="text-sm text-muted-foreground">
          This member isn&apos;t an instructor or student — add that role under Edit
          roles, or use <span className="font-medium text-foreground">Assign pair</span>{" "}
          on the People page to pick any instructor and student.
        </p>
      ) : null}

      {/* Non-admin request / remove — Flutter parity */}
      {!isAdmin && !viewingSelf && (showInstructorBlock || showStudentBlock) && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {amStudent && showInstructorBlock && (
            alreadyPairedAsTheirStudent ? (
              <Button
                variant="outline"
                size="sm"
                disabled={unassignSelfStudent.isPending}
                onClick={async () => {
                  if (myStudentId == null || subjectInstructorId == null) return;
                  const ok = await confirm({
                    title: `Remove ${memberName(ou)} as your instructor?`,
                    description: "You can request them again later; an admin can also re-pair you.",
                    confirmLabel: "Remove",
                    destructive: true,
                  });
                  if (!ok) return;
                  try {
                    await unassignSelfStudent.mutateAsync({
                      studentId: myStudentId,
                      instructorId: subjectInstructorId,
                    });
                    toast.success("Instructor removed.");
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : "Couldn't remove.");
                  }
                }}
              >
                Remove as my instructor
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={requestInstructor.isPending}
                onClick={async () => {
                  if (subjectInstructorId == null) return;
                  try {
                    await requestInstructor.mutateAsync({
                      instructorId: subjectInstructorId,
                    });
                    toast.success("Request sent — an admin will need to approve it.");
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : "Couldn't send request.");
                  }
                }}
              >
                Request as my instructor
              </Button>
            )
          )}
          {amInstructor && showStudentBlock && (
            alreadyPairedAsTheirInstructor ? (
              <Button
                variant="outline"
                size="sm"
                disabled={unassignSelfInstructor.isPending}
                onClick={async () => {
                  if (myInstructorId == null || subjectStudentId == null) return;
                  const ok = await confirm({
                    title: `Remove ${memberName(ou)} as your student?`,
                    description: "They will no longer appear under My students.",
                    confirmLabel: "Remove",
                    destructive: true,
                  });
                  if (!ok) return;
                  try {
                    await unassignSelfInstructor.mutateAsync({
                      studentId: subjectStudentId,
                      instructorId: myInstructorId,
                    });
                    toast.success("Student removed.");
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : "Couldn't remove.");
                  }
                }}
              >
                Remove as my student
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={requestStudent.isPending}
                onClick={async () => {
                  if (subjectStudentId == null) return;
                  try {
                    await requestStudent.mutateAsync({ studentId: subjectStudentId });
                    toast.success("Request sent — an admin will need to approve it.");
                  } catch (e) {
                    toast.error(e instanceof ApiError ? e.message : "Couldn't send request.");
                  }
                }}
              >
                Request as my student
              </Button>
            )
          )}
        </div>
      )}

      {(showInstructorBlock || showStudentBlock) &&
        (partners.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : partners.isError ? (
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load instruction partners for this member.
          </p>
        ) : (
          <div className="space-y-4">
            {showInstructorBlock && (
              <PartnerList
                title="Students"
                people={students}
                empty="No students assigned yet."
              />
            )}
            {showStudentBlock && (
              <PartnerList
                title="Instructors"
                people={instructors}
                empty="No instructors assigned yet."
              />
            )}
          </div>
        ))}

      <AssignInstructionDialog
        open={dialogMode != null}
        onOpenChange={(open) => {
          if (!open) setDialogMode(null);
        }}
        mode={dialogMode}
        subject={ou}
        subjectInstructorId={subjectInstructorId}
        subjectStudentId={subjectStudentId}
        assignedRoleIds={assignedForDialog}
      />
    </div>
  );
}

function PartnerList({
  title,
  people,
  empty,
}: {
  title: string;
  people: AssignedPerson[];
  empty: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        {people.length > 0 && (
          <span className="ml-1 normal-case text-muted-foreground/80">({people.length})</span>
        )}
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {people.map((p) => {
            const name = p.orgUser?.user?.name ?? "Unnamed";
            return (
              <li key={p.id} className="flex items-center gap-3 py-2">
                <Avatar className="size-8">
                  {p.orgUser?.profileImage && (
                    <AvatarImage src={p.orgUser.profileImage} alt={name} />
                  )}
                  <AvatarFallback className="text-xs">{initials(name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{name}</div>
                  {p.orgUser?.user?.email && (
                    <div className="truncate text-xs text-muted-foreground">
                      {p.orgUser.user.email}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
