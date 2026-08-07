import * as React from "react";
import { FileSignature, GraduationCap, Loader2, PenLine } from "lucide-react";
import type { CandidateLesson, Reservation } from "@/types/api";
import { gradeCodesOf } from "@/types/api";
import { useAuth } from "@/lib/auth";
import {
  useCandidateLessons,
  useSaveLessonRecord,
  useSignLessonRecord,
} from "@/features/queries";
import { deciHours } from "@/lib/training";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

/**
 * Grade the lesson from inside the close-out.
 *
 * This is the whole reason the module was built this shape. Every competitor makes an
 * instructor close out the flight in one place and then record the training in another —
 * duplicate entry is the loudest complaint about all of them — and the fix is not a better
 * second screen, it is not having one. The close-out already knows who flew, for how long,
 * and on what; the only thing missing was WHICH LESSON, and that is one tap.
 *
 * The times are prefilled from the readings the close-out already captured: the Hobbs delta
 * for flight time and `briefing` for instruction. An instructor retyping 1.5 into a box that
 * already knows it is 1.5 is exactly the friction that sends people back to paper.
 *
 * Renders nothing at all unless this booking is instruction with a student on it and that
 * student is enrolled on something — which is most bookings, and they should see no trace
 * of this.
 */
export function LessonSection({ reservation }: { reservation: Reservation }) {
  const r = reservation;
  const { orgUserId, isStaff } = useAuth();

  //EVERY student on the booking, not just the first. Two students in one aircraft and a
  //group ground school are both ordinary — split billing exists precisely because they
  //are — and grading only the first would leave the second one's record silently blank.
  const students = r.personnel?.students ?? [];
  const isInstructional = ["dual", "ground", "sim", "solo"].includes(r.type);
  //An instructor on the booking, or staff. A student cannot grade their own lesson.
  const canGrade =
    isStaff || (r.personnel?.instructors ?? []).some((i) => i.id === orgUserId);

  if (students.length === 0 || !isInstructional || !canGrade) return null;

  return (
    <>
      <Separator />
      <section data-doc-shot="closeout-training-section" className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Training record
          <DocsHint topic="grade-at-close-out" />
        </h3>
        {students.map((s) => (
          <StudentLessons key={s.id} student={s} reservation={r} />
        ))}
      </section>
    </>
  );
}

/** One student's courses on this booking. Renders nothing if they are enrolled on none. */
function StudentLessons({
  student,
  reservation,
}: {
  student: { id: number; user?: { name?: string } | null };
  reservation: Reservation;
}) {
  const candidates = useCandidateLessons({ orgUserId: student.id, type: reservation.type });
  const enrollments = (candidates.data ?? []).filter((e) => e.lessons.length > 0);

  if (candidates.isLoading) return null;
  //Not enrolled on anything this booking could be a lesson for. Silence is right: most
  //schools will never use curriculum, and a "no courses" notice on every dual booking
  //would be noise on the busiest screen in the product.
  if (enrollments.length === 0) return null;

  return (
    <div className="space-y-2">
      <Badge variant="outline" className="gap-1">
        <GraduationCap className="size-3" />
        {student.user?.name ?? "Student"}
      </Badge>
      {enrollments.map((e) => (
        <LessonGrader
          key={e.enrollmentId}
          enrollmentId={e.enrollmentId}
          courseName={e.course.name}
          //The course's OWN marks. This grader offered a hard-coded S/U/I, so a school on
          //its own scale could not grade from the close-out at all: the server refused the
          //grade, and the close-out is where most grading happens.
          scale={gradeCodesOf(e)}
          lessons={e.lessons}
          reservation={reservation}
        />
      ))}
    </div>
  );
}

function LessonGrader({
  enrollmentId,
  courseName,
  scale,
  lessons,
  reservation,
}: {
  enrollmentId: number;
  courseName: string;
  /** This course's marks, in display order. Never empty. */
  scale: string[];
  lessons: CandidateLesson[];
  reservation: Reservation;
}) {
  const r = reservation;

  //The first unfinished lesson, which is the right answer almost every time.
  const suggested = lessons.find((l) => !l.complete) ?? lessons[0];
  const [lessonId, setLessonId] = React.useState<number>(suggested?.id ?? 0);
  const [open, setOpen] = React.useState(false);

  //Straight off the close-out. `briefing` is what the instruction line is billed from, and
  //the Hobbs delta is what the aircraft line is billed from — the same two numbers the
  //invoice uses, so the record and the bill can never disagree about what was flown.
  const hobbsDelta =
    r.review?.hobbsTimeIn != null && r.review?.hobbsTimeOut != null
      ? Math.max(0, r.review.hobbsTimeIn - r.review.hobbsTimeOut)
      : null;

  const [flight, setFlight] = React.useState(() =>
    hobbsDelta ? deciHours(hobbsDelta) : ""
  );
  const [ground, setGround] = React.useState(() =>
    r.review?.briefing ? deciHours(r.review.briefing) : ""
  );
  //The course's first mark, which is the pass on every scale we ship and on almost every
  //scale a school writes. Not the literal "S": that is refused outright by a course that
  //does not use it.
  const [grade, setGrade] = React.useState(() => scale[0] ?? "S");
  const [notes, setNotes] = React.useState("");
  const [warning, setWarning] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const save = useSaveLessonRecord();
  const sign = useSignLessonRecord();

  const lesson = lessons.find((l) => l.id === lessonId) ?? suggested;
  const toDeci = (v: string): number | null => {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 10);
  };

  if (done) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-sm">
        <FileSignature className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          <span className="font-medium">{lesson?.name}</span> signed and credited to{" "}
          {courseName}.
        </span>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">{courseName} · next up</span>
          <div className="font-medium">{suggested?.name}</div>
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <PenLine className="size-4" /> Grade this lesson
        </Button>
      </div>
    );
  }

  const busy = save.isPending || sign.isPending;
  const error = (save.error ?? sign.error) as Error | null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label htmlFor={`lesson-${enrollmentId}`}>Lesson</Label>
        {/* A native select rather than the styled one: this sits inside the detail sheet,
            which is itself a popover layer, and stacking a second portal inside it is how
            you get a dropdown that renders behind the thing that opened it. */}
        <select
          id={`lesson-${enrollmentId}`}
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={lessonId}
          onChange={(e) => setLessonId(Number(e.target.value))}
        >
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.complete ? "✓ " : ""}
              {l.stageName} · {l.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`grade-${enrollmentId}`}>Grade</Label>
          <select
            id={`grade-${enrollmentId}`}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          >
            {scale.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`flight-${enrollmentId}`}>Flight</Label>
          <Input
            id={`flight-${enrollmentId}`}
            inputMode="decimal"
            value={flight}
            onChange={(e) => setFlight(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`ground-${enrollmentId}`}>Ground</Label>
          <Input
            id={`ground-${enrollmentId}`}
            inputMode="decimal"
            value={ground}
            onChange={(e) => setGround(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`notes-${enrollmentId}`}>Notes</Label>
        <Textarea
          id={`notes-${enrollmentId}`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What to work on next time."
        />
      </div>

      {warning ? <p className="text-sm text-amber-600">{warning}</p> : null}
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={busy || !lessonId}
          onClick={async () => {
            const saved = await save.mutateAsync({
              enrollmentId,
              lessonId,
              grade,
              notes: notes.trim() || null,
              flightDeciHours: toDeci(flight),
              instructionDeciHours: toDeci(ground),
              //The link back to the booking this came from. It is what makes the record
              //traceable to the flight, and what lets the record survive the booking
              //being deleted later.
              reservationId: r.id,
            });
            if (saved.warning) setWarning(saved.warning);
            await sign.mutateAsync({ recordId: saved.id });
            setDone(true);
          }}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSignature className="size-4" />}
          Sign lesson
        </Button>
      </div>
    </div>
  );
}
