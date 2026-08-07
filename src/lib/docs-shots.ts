/**
 * Crop targets for the help documentation's screenshots.
 *
 * The website repo declares one screenshot per id and captures it by cropping to
 * `[data-doc-shot="<id>"]`, so a documentation image is the thing the paragraph
 * is about rather than a whole viewport with the subject reduced to a postage
 * stamp. Most screens carry their id inline, as a literal attribute on the
 * element being photographed.
 *
 * Reports are the exception. One component renders every report, so the element
 * that IS "Student progress" and the element that IS "Utilization grouped by
 * resource" are the same box with a different report in it. This maps a report
 * to the id the documentation knows it by, which is what keeps `report-view.tsx`
 * free of any knowledge of a particular report.
 *
 * Inert: nothing styles, queries or tests these.
 */

/** Which part of a report view is being photographed. */
export type ReportShotPart =
  /** The whole frame: toolbar, filter chips, date basis, table and totals. */
  | "frame"
  /** The results card on its own: the table and its totals row. */
  | "results";

const SHOTS: Record<ReportShotPart, Record<string, string>> = {
  frame: {
    revenue: "report-shell-revenue",
    /**
     * Half of a pair. The article crops Revenue and Payments received over the
     * same window to show why their totals differ, so its other capture is the
     * revenue frame above.
     */
    payments: "revenue-vs-payments",
  },
  results: {
    "training-progress": "report-student-progress",
    "training-records": "report-training-records",
    endorsements: "report-endorsement-expirations",
    utilization: "report-grouped-utilization",
  },
};

/** The documentation's id for this report, where it photographs one. */
export function reportDocShot(reportId: string, part: ReportShotPart): string | undefined {
  return SHOTS[part][reportId];
}
