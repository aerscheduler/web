import { useState } from "react";
import { toast } from "sonner";
import { GraduationCap, UserMinus, UserRound } from "lucide-react";
import type { AssignedPerson } from "@/types/api";
import { useAuth } from "@/lib/auth";
import { isInstructor, isStudent } from "@/lib/permissions";
import {
  useUnassignSelfAsInstructor,
  useUnassignSelfAsStudent,
  useUserInstructionPartners,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function initials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function PersonRow({
  person,
  onRemove,
  removing,
}: {
  person: AssignedPerson;
  onRemove?: () => void;
  removing?: boolean;
}) {
  const user = person.orgUser?.user;
  return (
    <li className="flex items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback className="text-xs">{initials(user?.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user?.name ?? "Unnamed member"}</p>
        {user?.email && (
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        )}
      </div>
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={removing}
          aria-label={`Remove ${user?.name ?? "partner"}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <UserMinus className="size-4" />
        </Button>
      )}
    </li>
  );
}

/**
 * "My students" / "My instructors" on /me. Remove uses Flutter self-unassign
 * endpoints. Admins assign from People → member sheet; request from a profile.
 */
export function InstructionPartnersCard() {
  const { roles, userId, membership } = useAuth();
  const confirm = useConfirm();
  const instructs = isInstructor(roles);
  const studies = isStudent(roles);

  const q = useUserInstructionPartners(userId, { enabled: instructs || studies });
  const myInstructorId =
    membership?.instructorRole?.id ?? q.data?.instructorRoleId ?? null;
  const myStudentId = membership?.studentRole?.id ?? q.data?.studentRoleId ?? null;

  const unassignStudent = useUnassignSelfAsStudent();
  const unassignInstructor = useUnassignSelfAsInstructor();
  const [busyId, setBusyId] = useState<number | null>(null);

  if (!instructs && !studies) return null;

  const sections = [
    instructs && {
      key: "students",
      title: "My students",
      icon: GraduationCap,
      people: q.data?.students ?? [],
      empty:
        "No students are assigned to you yet. Admins pair from People, or request from a student's profile.",
      onRemove: async (person: AssignedPerson) => {
        if (myInstructorId == null) return;
        const name = person.orgUser?.user?.name ?? "this student";
        const ok = await confirm({
          title: `Remove ${name}?`,
          description: "They will no longer appear under My students.",
          confirmLabel: "Remove",
          destructive: true,
        });
        if (!ok) return;
        setBusyId(person.id);
        try {
          await unassignInstructor.mutateAsync({
            studentId: person.id,
            instructorId: myInstructorId,
          });
          toast.success("Student removed.");
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "Couldn't remove.");
        } finally {
          setBusyId(null);
        }
      },
    },
    studies && {
      key: "instructors",
      title: "My instructors",
      icon: UserRound,
      people: q.data?.instructors ?? [],
      empty:
        "No instructor is assigned to you yet. Ask your school to pair you, or request from an instructor's profile.",
      onRemove: async (person: AssignedPerson) => {
        if (myStudentId == null) return;
        const name = person.orgUser?.user?.name ?? "this instructor";
        const ok = await confirm({
          title: `Remove ${name}?`,
          description: "You can request them again later.",
          confirmLabel: "Remove",
          destructive: true,
        });
        if (!ok) return;
        setBusyId(person.id);
        try {
          await unassignStudent.mutateAsync({
            studentId: myStudentId,
            instructorId: person.id,
          });
          toast.success("Instructor removed.");
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "Couldn't remove.");
        } finally {
          setBusyId(null);
        }
      },
    },
  ].filter(Boolean) as {
    key: string;
    title: string;
    icon: typeof GraduationCap;
    people: AssignedPerson[];
    empty: string;
    onRemove: (person: AssignedPerson) => Promise<void>;
  }[];

  return (
    <>
      {sections.map((s) => (
        <Card key={s.key}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <s.icon className="size-4 text-muted-foreground" aria-hidden />
              {s.title}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {q.isPending ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-2/3" />
              </div>
            ) : q.isError ? (
              <p className="text-sm text-muted-foreground">Couldn&rsquo;t load this right now.</p>
            ) : s.people.length === 0 ? (
              <p className="text-sm text-muted-foreground">{s.empty}</p>
            ) : (
              <ul className="space-y-3">
                {s.people.map((p) => (
                  <PersonRow
                    key={p.id}
                    person={p}
                    removing={busyId === p.id}
                    onRemove={() => void s.onRemove(p)}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </>
  );
}
