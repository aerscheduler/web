/**
 * CSV export, shared by every report.
 *
 * Deliberately generic — a report declares its columns and hands over its rows, so a new
 * report tab gets a working export for free rather than growing its own. The school takes
 * these into a spreadsheet and into QuickBooks, which imports CSV natively; that is the
 * whole reason we are not building a QuickBooks integration.
 */

export type CsvColumn<T> = {
  /** Column heading, written verbatim into the header row. */
  header: string;
  /**
   * The cell value. Return a number for anything that should stay numeric in a
   * spreadsheet — money belongs here as DOLLARS, not a "$1,234.00" string, or the
   * recipient can't sum the column.
   */
  value: (row: T) => string | number | null | undefined;
};

/**
 * Escape one field per RFC 4180.
 *
 * Quotes are doubled and the field is wrapped whenever it contains a comma, a quote or a
 * newline — a tail number never will, but a note or a person's name can, and an unescaped
 * comma silently shifts every later column on that row.
 */
function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows + columns → an RFC 4180 CSV string. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
  return [header, ...body].join("\r\n");
}

/**
 * Build the CSV and hand it to the browser as a download.
 *
 * The leading BOM is what makes Excel read it as UTF-8; without it a tail number is fine
 * but any accented name in a student column arrives mangled.
 */
export function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]): void {
  const blob = new Blob(["﻿", toCsv(columns, rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  //Revoking immediately can cancel the download in some browsers; a tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** `revenue-by-aircraft_2026-06-01_2026-06-30` — dated, so saved files stay distinguishable. */
export function reportFilename(base: string, startISO?: string, endISO?: string): string {
  const day = (iso?: string) => (iso ? iso.slice(0, 10) : "");
  const range = [day(startISO), day(endISO)].filter(Boolean).join("_");
  return range ? `${base}_${range}` : base;
}
