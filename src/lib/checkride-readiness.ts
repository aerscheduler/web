/**
 * Is this student ready to take the practical test? A checklist, not a gate.
 *
 * What a chief instructor checks before sending someone to a DPE, in the order they check
 * it: the syllabus, the hours (with their recency windows), and the endorsements the
 * examiner will ask to see. The endorsement codes are AC 61-65K Appendix A:
 *
 *   - A.1, §61.39(a)(6)(i)-(ii): training for the test, signed within the preceding two
 *     calendar months of the month of application. The one with a clock on it.
 *   - A.2, §61.39(a)(6)(iii): review of the knowledge test's deficiencies. Only needed when
 *     the test report lists any, which this product does not know, so it is advisory.
 *   - The certificate's own knowledge test and practical test endorsements.
 *
 * Nothing here blocks anything. A Part 141 graduation has its own server gate; this is
 * the "what is still missing" list a person reads.
 */

import type { Endorsement, EnrollmentProgress } from "@/types/api";

export type ReadinessItem = {
  key: string;
  label: string;
  /** "done", "missing", or "advisory" (cannot be known here; a reminder). */
  state: "done" | "missing" | "advisory";
  detail: string;
};

/** Knowledge test and practical test endorsement codes, by `course.certificateSought`. */
export const TEST_ENDORSEMENTS: Record<string, { knowledge: string; practical: string; name: string }> = {
  private: { knowledge: "A.36", practical: "A.37", name: "private pilot" },
  commercial: { knowledge: "A.38", practical: "A.39", name: "commercial pilot" },
  instrument: { knowledge: "A.42", practical: "A.43", name: "instrument rating" },
  cfi: { knowledge: "A.46", practical: "A.47", name: "flight instructor" },
};

/** The first of the month `months` calendar months before `now`'s month, local time. */
export function calendarMonthsBack(now: Date, months: number): Date {
  return new Date(now.getFullYear(), now.getMonth() - months, 1);
}

const isLive = (e: Endorsement, now: Date) => !e.expiresAt || new Date(e.expiresAt).getTime() > now.getTime();

/** The newest live endorsement carrying this AC code, or null. */
function latest(endorsements: readonly Endorsement[], code: string, now: Date): Endorsement | null {
  return (
    endorsements
      .filter((e) => e.templateCode === code && isLive(e, now))
      .sort((a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime())[0] ?? null
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function checkrideReadiness(
  progress: Pick<EnrollmentProgress, "standings" | "lessonsComplete" | "lessonsTotal"> & {
    certificateSought: string | null;
  },
  endorsements: readonly Endorsement[],
  now: Date = new Date()
): { items: ReadinessItem[]; ready: boolean } | null {
  const tests = progress.certificateSought ? TEST_ENDORSEMENTS[progress.certificateSought] : undefined;
  //A course with no certificate named (a checkout, a refresher) has no practical test.
  if (!tests) return null;

  const items: ReadinessItem[] = [];

  const lessonsLeft = progress.lessonsTotal - progress.lessonsComplete;
  items.push({
    key: "lessons",
    label: "Syllabus complete",
    state: lessonsLeft <= 0 ? "done" : "missing",
    detail: lessonsLeft <= 0 ? `All ${progress.lessonsTotal} lessons` : `${lessonsLeft} ${lessonsLeft === 1 ? "lesson" : "lessons"} to go, of ${progress.lessonsTotal}`,
  });

  //FAA-sourced only: a school's own stricter bar is ambition, not a test prerequisite.
  const short = progress.standings.filter((s) => s.faaSourced && !s.met);
  items.push({
    key: "hours",
    label: "Hour requirements met",
    state: short.length === 0 ? "done" : "missing",
    detail:
      short.length === 0
        ? "Every FAA minimum, inside its window"
        : //Requirement labels are long ("instrument training from an instructor with..."), so
          //one by name and the rest as a count; the Requirements tab has them all.
          `Short on ${short[0].label.toLowerCase()}${short.length > 1 ? `, and ${short.length - 1} more` : ""}`,
  });

  const knowledge = latest(endorsements, tests.knowledge, now);
  items.push({
    key: "knowledge",
    label: `Knowledge test endorsement (${tests.knowledge})`,
    state: knowledge ? "done" : "missing",
    detail: knowledge ? `Signed ${day(knowledge.signedAt)}` : `Needed to sit the ${tests.name} knowledge test`,
  });

  const practical = latest(endorsements, tests.practical, now);
  items.push({
    key: "practical",
    label: `Practical test endorsement (${tests.practical})`,
    state: practical ? "done" : "missing",
    detail: practical ? `Signed ${day(practical.signedAt)}` : "The instructor's sign-off on flight proficiency",
  });

  //§61.39(a)(6): within the preceding 2 calendar months of the month of the test. Judged
  //against this month, so it tells you whether a test THIS month would be legal.
  const opens = calendarMonthsBack(now, 2);
  const prereq = latest(endorsements, "A.1", now);
  const prereqCurrent = prereq != null && new Date(prereq.signedAt).getTime() >= opens.getTime();
  items.push({
    key: "prereq",
    label: "Practical test prerequisites (A.1)",
    state: prereqCurrent ? "done" : "missing",
    detail: prereqCurrent
      ? `Signed ${day(prereq!.signedAt)}, good for a test through the end of ${new Date(
          new Date(prereq!.signedAt).getFullYear(),
          new Date(prereq!.signedAt).getMonth() + 2,
          1
        ).toLocaleDateString(undefined, { month: "long" })}`
      : prereq
        ? `Signed ${day(prereq.signedAt)}, older than two calendar months. Sign a new one.`
        : "3 hours of test prep within 2 calendar months of the test",
  });

  const review = latest(endorsements, "A.2", now);
  items.push({
    key: "review",
    label: "Knowledge test deficiencies reviewed (A.2)",
    state: review ? "done" : "advisory",
    detail: review ? `Signed ${day(review.signedAt)}` : "Only if the knowledge test report lists missed areas",
  });

  return { items, ready: items.every((i) => i.state !== "missing") };
}
