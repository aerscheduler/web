import * as React from "react";
import { FileSignature, GraduationCap, Loader2, PenLine } from "lucide-react";
import type {
  CandidateEnrollment,
  CandidateLesson,
  Reservation,
  ReservationPayer,
} from "@/types/api";
import { gradeCodesOf } from "@/types/api";
import { useAuth } from "@/lib/auth";
import {
  useCandidateLessonsFor,
  useMyTrainingGrants,
  useSaveLessonRecord,
  useSignLessonRecord,
} from "@/features/queries";
import { deciHours } from "@/lib/training";
import { billsOnHobbs } from "./close-out";
import { CloseOutCard } from "./close-out-card";
import {
  closeOutCardCounts,
  closeOutDraftForBooking,
  closeOutSummary,
  lessonHeldOnOtherBooking,
  seedCloseOutGrader,
  signedOnReservation,
  suggestedCloseableLesson,
  syllabusHasWorkLeft,
} from "./lesson-section.state";
import { TaskGradeList, taskGradePayload } from "@/components/training/task-grades";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

/**
 * Grade the lesson from inside the close-out.
 *
 * This is the whole reason the module was built this shape. Every competitor makes an
 * instructor close out the flight in one place and then record the training in another.
 * duplicate entry is the loudest complaint about all of them, and the fix is not a better
 * second screen, it is not having one. The close-out already knows who flew, for how long,
 * and on what; the only thing missing was WHICH LESSON, and that is one tap.
 *
 * The times are prefilled from the readings the close-out already captured: the Hobbs delta
 * for flight time and `briefing` for instruction. An instructor retyping 1.5 into a box that
 * already knows it is 1.5 is exactly the friction that sends people back to paper.
 *
 * Renders nothing at all unless this booking is instruction with a student on it and that
 * student is enrolled on something, which is most bookings, and they should see no trace
 * of this.
 */
export function LessonSection({ reservation }: { reservation: Reservation }) {
  const r = reservation;
  const { roles, isAdmin } = useAuth();

  //EVERY student on the booking, not just the first. Two students in one aircraft and a
  //group ground school are both ordinary, split billing exists precisely because they
  //are, and grading only the first would leave the second one's record silently blank.
  const students = r.personnel?.students ?? [];
  const isInstructional = ["dual", "ground", "sim", "solo"].includes(r.type);
  //Same source as the enrollment Grade button: GET /training/grants/mine.canGrade.
  //Roles are a fallback only when that request never answers, matching the phone.
  const mine = useMyTrainingGrants({ enabled: isInstructional });
  const canGrade =
    mine.data != null
      ? mine.data.canGrade
      : mine.isError
        ? isAdmin || roles.includes("instructor")
        : false;
  const eligible = isInstructional && canGrade;

  //Asked for the WHOLE booking up here, not per student down in `StudentLessons`.
  //Whether there is any grading to do is a question about all of them at once, and
  //while each student answered it privately the section could not tell "no one here is
  //enrolled" from "still loading": it drew the header and an empty "Grade the lesson"
  //card on every dual booking at a school that has never touched curriculum.
  const candidates = useCandidateLessonsFor(
    students.map((s) => s.id),
    r.type,
    { enabled: eligible }
  );

  //How much grading this booking is carrying, and how much of it is done. Kept up here so
  //the card can answer its own question while shut: on a two-student lesson "1 of 2 graded"
  //is the whole reason to open it, and on a class of six it is the difference between the
  //instructor scrolling six forms and scrolling none.
  const [graders, setGraders] = React.useState<Record<string, boolean>>({});
  const report = React.useCallback((key: string, signed: boolean) => {
    setGraders((prev) => (prev[key] === signed ? prev : { ...prev, [key]: signed }));
  }, []);

  if (students.length === 0 || !eligible) return null;
  //Nothing at all until every student has answered, then nothing at all unless at least
  //one of them is enrolled on a course with lessons this booking could close out. Most
  //schools will never use curriculum and should see no trace of this.
  if (candidates.some((q) => q.isPending)) return null;
  const rows = students
    .map((s, i) => ({
      student: s,
      enrollments: (candidates[i]?.data ?? []).filter((e) => e.lessons.length > 0),
    }))
    .filter((row) => row.enrollments.length > 0);
  if (rows.length === 0) return null;

  //One grader per course per student. Counted from the candidate payload (which bookings
  //already have a signed record, which syllabi are finished) plus any Sign that has not
  //been refetched yet. `CollapsibleContent` unmounts its children while shut, so counting
  //only those reports made the summary read 0 of N on reload, and on a class of six that
  //is the whole reason to open the fold.
  const { total, signed, remaining } = closeOutCardCounts(
    rows.map((row) => ({ studentId: row.student.id, enrollments: row.enrollments })),
    r.id,
    graders
  );

  return (
    <>
      <Separator />
      <section data-doc-shot="closeout-training-section" className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Training record
          <DocsHint topic="grade-at-close-out" />
        </h3>
        <CloseOutCard
          title="Grade the lesson"
          icon={GraduationCap}
          summary={closeOutSummary({ total, signed, remaining })}
          //Shut, always. This was the single longest thing on the sheet: one form per
          //course per student, so a two-student booking opened five of them and pushed the
          //close-out itself off the screen. "0 of 5 graded" in the header says there is
          //work here without spending a screen and a half to say it.
        >
          <div className="space-y-2">
            {rows.map(({ student, enrollments }) => (
              <StudentLessons
                key={student.id}
                student={student}
                enrollments={enrollments}
                reservation={r}
                signedByKey={graders}
                onReport={report}
              />
            ))}
          </div>
        </CloseOutCard>
      </section>
    </>
  );
}

/**
 * One student's courses on this booking. The section above has already fetched and
 * filtered these, and only renders this for a student with at least one, so that the
 * header and the card can be withheld entirely when nobody on the booking has any.
 */
function StudentLessons({
  student,
  enrollments,
  reservation,
  signedByKey,
  onReport,
}: {
  student: { id: number; user?: { name?: string } | null };
  /** This student's enrollments that carry lessons. Never empty. */
  enrollments: CandidateEnrollment[];
  reservation: Reservation;
  signedByKey: Record<string, boolean>;
  /** Tells the section a grader exists, and whether it has been signed. */
  onReport: (key: string, signed: boolean) => void;
}) {
  //THIS student's stake, if the close-out recorded one. On a split booking the operator has
  //already typed each person's own meters and instruction time in Who pays what, directly
  //above this, and the grader used to ignore all of it and seed everybody from the
  //airframe. See the prefill in `LessonGrader`.
  const payer = (reservation.payers ?? []).find((p) => p.orgUser?.id === student.id) ?? null;

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
          payer={payer}
          //The course's OWN marks. This grader offered a hard-coded S/U/I, so a school on
          //its own scale could not grade from the close-out at all: the server refused the
          //grade, and the close-out is where most grading happens.
          scale={gradeCodesOf(e)}
          lessons={e.lessons}
          reservation={reservation}
          reportKey={`${student.id}:${e.enrollmentId}`}
          alreadySigned={signedOnReservation(
            e,
            reservation.id,
            !!signedByKey[`${student.id}:${e.enrollmentId}`]
          )}
          signedLessonName={
            (e.gradedOn ?? []).find((g) => g.reservationId === reservation.id)?.lessonName ??
            null
          }
          onReport={onReport}
        />
      ))}
    </div>
  );
}

function LessonGrader({
  enrollmentId,
  courseName,
  payer,
  scale,
  lessons,
  reservation,
  reportKey,
  alreadySigned,
  signedLessonName,
  onReport,
}: {
  enrollmentId: number;
  courseName: string;
  /** This student's own stake in the close-out, when one was recorded. */
  payer: ReservationPayer | null;
  /** This course's marks, in display order. Never empty. */
  scale: string[];
  lessons: CandidateLesson[];
  reservation: Reservation;
  reportKey: string;
  alreadySigned: boolean;
  /** Lesson signed on THIS booking, when the payload already knows. */
  signedLessonName: string | null;
  onReport: (key: string, signed: boolean) => void;
}) {
  const r = reservation;

  //The first unfinished lesson. A leftover unsigned row already tied to another
  //flight is still next-up: Sign takes that draft over for this booking.
  const suggested = suggestedCloseableLesson(lessons, r.id);
  const syllabusDone = !syllabusHasWorkLeft(lessons);
  const [lessonId, setLessonId] = React.useState<number>(suggested?.id ?? lessons[0]?.id ?? 0);
  const [open, setOpen] = React.useState(false);

  //Straight off the close-out, using the SAME meter the invoice prices from. Hobbs is the
  //usual case; a tach-billed tail must seed from tach or the record and the bill disagree.
  const onHobbs = billsOnHobbs(r);
  const meterDelta = onHobbs
    ? r.review?.hobbsTimeIn != null && r.review?.hobbsTimeOut != null
      ? Math.max(0, r.review.hobbsTimeIn - r.review.hobbsTimeOut)
      : null
    : r.review?.tachTimeIn != null && r.review?.tachTimeOut != null
      ? Math.max(0, r.review.tachTimeIn - r.review.tachTimeOut)
      : null;

  const payerMeterDelta = onHobbs
    ? payer?.hobbsIn != null && payer?.hobbsOut != null
      ? Math.max(0, payer.hobbsIn - payer.hobbsOut)
      : null
    : payer?.tachIn != null && payer?.tachOut != null
      ? Math.max(0, payer.tachIn - payer.tachOut)
      : null;
  //Minutes on the stake, tenths of an hour everywhere in training. Same conversion Who pays
  //what uses to render the field the operator typed it into.
  const payerGround =
    payer?.instructionMinutes != null ? Math.round(payer.instructionMinutes / 6) : null;

  const flightSeed = payerMeterDelta ?? meterDelta;
  const groundSeed = payerGround ?? r.review?.briefing ?? null;

  const [flight, setFlight] = React.useState(() => (flightSeed ? deciHours(flightSeed) : ""));
  const [ground, setGround] = React.useState(() => (groundSeed ? deciHours(groundSeed) : ""));
  //The course's first mark, which is the pass on every scale we ship and on almost every
  //scale a school writes. Not the literal "S": that is refused outright by a course that
  //does not use it.
  const [grade, setGrade] = React.useState(() => scale[0] ?? "S");
  const [notes, setNotes] = React.useState("");
  const [warning, setWarning] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(alreadySigned);
  //Device time, on a lesson flown in one. Part of the flight figure rather than extra, which
  //is what makes the course's simulator ceiling apply to it.
  const [sim, setSim] = React.useState("");
  const [taskMarks, setTaskMarks] = React.useState<Record<number, string>>({});

  React.useEffect(() => {
    if (alreadySigned) setDone(true);
  }, [alreadySigned]);

  //Tell the section this grader is here, and whether it has been signed yet.
  const finished = done || alreadySigned;
  React.useEffect(() => {
    onReport(reportKey, finished);
  }, [onReport, reportKey, finished]);

  const save = useSaveLessonRecord();
  const sign = useSignLessonRecord();

  //Seed before paint. A useEffect hydrate ran after the first frame, so Sign could
  //fire with meter seeds and empty notes and wipe a phone draft.
  const applyLessonSeed = (id: number) => {
    save.reset();
    sign.reset();
    setWarning(null);
    const current = lessons.find((l) => l.id === id) ?? suggested;
    const seeded = seedCloseOutGrader({
      draft: closeOutDraftForBooking(current?.draft, r.id),
      scale,
      flightSeed,
      groundSeed,
    });
    setGrade(seeded.grade);
    setNotes(seeded.notes);
    setFlight(seeded.flight);
    setGround(seeded.ground);
    setSim(seeded.sim);
    setTaskMarks(seeded.taskMarks);
    setLessonId(id);
  };

  const lesson = lessons.find((l) => l.id === lessonId) ?? suggested;
  const heldElsewhere = lessonHeldOnOtherBooking(lesson, r.id);
  const showSim = lesson?.kind === "sim" || r.type === "sim" || r.resource?.type?.simulator != null;
  //The tasks this lesson is made of. Absent on a school that writes lessons without them,
  //and on a console talking to a server that predates them being sent here.
  const tasks = lesson?.tasks ?? [];
  const needsNotes = lesson?.requiresNotes === true;
  const toDeci = (v: string): number | null => {
    const n = Number(v);
    return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 10);
  };

  if (finished) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-success/40 bg-success/5 p-3 text-sm">
        <FileSignature className="mt-0.5 size-4 shrink-0 text-success" />
        <span>
          <span className="font-medium">{signedLessonName ?? lesson?.name}</span> signed and credited to{" "}
          {courseName}.
        </span>
      </div>
    );
  }

  if (syllabusDone && !open) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">{courseName}</span>
          <div className="font-medium">Syllabus complete</div>
          <p className="mt-1 text-muted-foreground">
            Every matching lesson is already signed. Sign another dual on one of them if this
            flight was a retake.
          </p>
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => { applyLessonSeed(lessonId); setOpen(true); }}>
          <PenLine className="size-4" /> Grade another dual
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="space-y-2 rounded-md border p-3">
        <div className="text-sm">
          <span className="text-muted-foreground">{courseName} · next up</span>
          <div className="font-medium">
            {(lessons.find((l) => l.id === lessonId) ?? suggested)?.name}
          </div>
        </div>
        <Button size="sm" variant="outline" className="w-full" onClick={() => { applyLessonSeed(lessonId); setOpen(true); }}>
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
          onChange={(e) => applyLessonSeed(Number(e.target.value))}
        >
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.complete ? "✓ " : ""}
              {l.stageName} · {l.name}
              {lessonHeldOnOtherBooking(l, r.id) ? " (takes over other flight draft)" : ""}
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

      {/* Device time, on a lesson flown in one. A SUBSET of the flight figure beside it,
          not an addition: hours typed only into Flight are credited as aircraft time, and
          the course's simulator ceiling never sees them. This field is the only thing that
          keeps a Part 141 course inside its Appendix B allowance, and it was phone-only. */}
      {showSim && (
        <div className="space-y-1">
          <Label htmlFor={`sim-${enrollmentId}`}>Of the flight hours, in a simulator</Label>
          <Input
            id={`sim-${enrollmentId}`}
            inputMode="decimal"
            value={sim}
            onChange={(e) => setSim(e.target.value)}
            placeholder="1.0"
          />
        </div>
      )}

      <TaskGradeList tasks={tasks} scale={scale} value={taskMarks} onChange={setTaskMarks} />

      <div className="space-y-1">
        {/* "Notes required" is a syllabus setting on the lesson. It used to be enforced by
            the phone alone, so the same lesson signed from a desk skipped the narrative the
            school had asked for. The server refuses it now, and saying so here means the
            instructor learns it before pressing Sign rather than from an error. */}
        <Label htmlFor={`notes-${enrollmentId}`}>
          Notes{needsNotes && <span className="ml-1 text-muted-foreground">(required)</span>}
        </Label>
        <Textarea
          id={`notes-${enrollmentId}`}
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What to work on next time."
        />
        {needsNotes && !notes.trim() && (
          <p className="text-xs text-muted-foreground">
            This lesson needs notes before it can be signed.
          </p>
        )}
      </div>

      {warning ? <p className="text-sm text-amber-600">{warning}</p> : null}
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      {lesson?.complete ? (
        <p className="text-sm text-muted-foreground">
          This lesson is already signed. Signing again records another dual for this flight.
        </p>
      ) : null}
      {heldElsewhere ? (
        <p className="text-sm text-muted-foreground">
          An unsigned draft for this lesson is on another flight. Sign takes it over for this
          booking and uses these hours.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            if (suggested) setLessonId(suggested.id);
          }}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1"
          disabled={
            busy ||
            !lessonId ||
            (needsNotes && !notes.trim())
          }
          onClick={async () => {
            const saved = await save.mutateAsync({
              enrollmentId,
              lessonId,
              grade,
              notes: notes.trim() || null,
              flightDeciHours: toDeci(flight),
              instructionDeciHours: toDeci(ground),
              simulatorDeciHours: showSim ? toDeci(sim) : undefined,
              ...(tasks.length ? { taskGrades: taskGradePayload(taskMarks) } : {}),
              reservationId: r.id,
              ...(lesson?.recordId ? { recordId: lesson.recordId } : {}),
            });
            if (saved.warning) toast.message(saved.warning);
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
