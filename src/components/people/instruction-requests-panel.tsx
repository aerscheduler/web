import { toast } from "sonner";
import { Check, GraduationCap, X } from "lucide-react";
import {
  useInstructorPairRequests,
  useRespondInstructorPairRequest,
  useRespondStudentPairRequest,
  useStudentPairRequests,
} from "@/features/queries";
import type { InstructionPairRequest } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { initials } from "@/lib/utils";

function personName(side: InstructionPairRequest["student"]): string {
  return side?.orgUser?.user?.name ?? "Unknown";
}

function personEmail(side: InstructionPairRequest["student"]): string | undefined {
  return side?.orgUser?.user?.email ?? undefined;
}

/**
 * Pending instructor↔student pairing requests (admin). Mirrors Flutter's
 * StudentRequests + InstructorRequests sheets.
 */
export function InstructionRequestsPanel() {
  const { isAdmin } = useAuth();
  const studentsQ = useStudentPairRequests({ enabled: isAdmin });
  const instructorsQ = useInstructorPairRequests({ enabled: isAdmin });

  if (!isAdmin) return null;

  const studentReqs = studentsQ.data ?? [];
  const instructorReqs = instructorsQ.data ?? [];
  const total = studentReqs.length + instructorReqs.length;

  if (studentsQ.isLoading || instructorsQ.isLoading || total === 0) return null;

  return (
    <Card className="mb-4 overflow-hidden border-[color-mix(in_oklch,var(--primary)_28%,transparent)]">
      <div className="flex items-center gap-2 border-b bg-[color-mix(in_oklch,var(--primary)_8%,transparent)] px-4 py-2.5">
        <GraduationCap className="size-4 text-primary" />
        <h2 className="text-sm font-semibold">
          Instruction pairing requests
          <span className="ml-1.5 text-muted-foreground">({total})</span>
        </h2>
      </div>
      <ul className="divide-y divide-border">
        {studentReqs.map((r) => (
          <StudentRequestRow key={`s-${r.id}`} request={r} />
        ))}
        {instructorReqs.map((r) => (
          <InstructorRequestRow key={`i-${r.id}`} request={r} />
        ))}
      </ul>
    </Card>
  );
}

function StudentRequestRow({ request }: { request: InstructionPairRequest }) {
  const respond = useRespondStudentPairRequest();
  const student = personName(request.student);
  const instructor = personName(request.instructor);
  const busy = respond.isPending;

  return (
    <li className="flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-9">
          <AvatarFallback>{initials(student)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {instructor} requested {student} as a student
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[personEmail(request.instructor), personEmail(request.student)]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            try {
              await respond.mutateAsync({ id: request.id, action: "accept" });
              toast.success(`${student} assigned to ${instructor}.`);
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Couldn't accept.");
            }
          }}
        >
          <Check className="size-4" /> Accept
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          aria-label="Decline"
          className="text-muted-foreground hover:text-destructive"
          onClick={async () => {
            try {
              await respond.mutateAsync({ id: request.id, action: "decline" });
              toast.success("Request declined.");
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Couldn't decline.");
            }
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function InstructorRequestRow({ request }: { request: InstructionPairRequest }) {
  const respond = useRespondInstructorPairRequest();
  const student = personName(request.student);
  const instructor = personName(request.instructor);
  const busy = respond.isPending;

  return (
    <li className="flex flex-col gap-3 px-4 py-2.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar className="size-9">
          <AvatarFallback>{initials(student)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {student} requested {instructor} as their instructor
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[personEmail(request.student), personEmail(request.instructor)]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            try {
              await respond.mutateAsync({ id: request.id, action: "accept" });
              toast.success(`${student} assigned to ${instructor}.`);
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Couldn't accept.");
            }
          }}
        >
          <Check className="size-4" /> Accept
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={busy}
          aria-label="Decline"
          className="text-muted-foreground hover:text-destructive"
          onClick={async () => {
            try {
              await respond.mutateAsync({ id: request.id, action: "decline" });
              toast.success("Request declined.");
            } catch (e) {
              toast.error(e instanceof ApiError ? e.message : "Couldn't decline.");
            }
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
    </li>
  );
}
