/**
 * Queries and mutations for the report engine.
 *
 * Three endpoints serve every report, so this file stays the same size no matter
 * how many reports the registry grows to.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "@/lib/api";
import { API_URL } from "@/lib/env";
import type {
  ReportCatalog,
  ReportConfig,
  ReportRunRequest,
  ReportRunResult,
  SavedReportView,
} from "@/types/reports";

/**
 * What this user may run, with every column, filter and dropdown resolved.
 *
 * Loaded once per session: the catalog only changes when the fleet or roster
 * does, and refetching it on every report switch would put a visible stall
 * between clicking a report and seeing it.
 */
export function useReportCatalog() {
  return useQuery({
    queryKey: ["report-catalog"],
    queryFn: () => api<ReportCatalog>("/reports/catalog"),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Run a report.
 *
 * The whole request is the query key, so changing a filter, a column or the page
 * is a new cache entry — and stepping back to a previous configuration is
 * instant rather than another round trip. `placeholderData` keeps the previous
 * table on screen while the next one loads, so paging doesn't blink through an
 * empty state.
 */
export function useReportRun(request: ReportRunRequest | null) {
  return useQuery({
    queryKey: ["report-run", request],
    enabled: !!request,
    queryFn: () => api<ReportRunResult>("/reports/run", { method: "POST", body: request }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Download the current report as a file.
 *
 * Deliberately not a React Query mutation: the response is a file, not JSON, so
 * it goes through fetch directly and is handed to the browser as a download. The
 * server builds it with the same serializer that will attach it to a scheduled
 * email, so the two can never drift.
 */
export async function downloadReport(request: ReportRunRequest, format: "csv" = "csv"): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_URL}/reports/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...request, format }),
  });

  if (!res.ok) {
    // The error body is JSON even though the success body is a file.
    let message = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* keep the status-code message */
    }
    throw new Error(message);
  }

  const blob = await res.blob();
  // Prefer the filename the server chose — it carries the report id and window,
  // so a folder of exports sorts chronologically.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? `${request.reportId}.${format}`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ---------------------------------------------------------------- saved views

export function useSavedViews(reportId?: string) {
  return useQuery({
    queryKey: ["report-views", reportId ?? "all"],
    queryFn: () =>
      api<SavedReportView[]>("/reports/views", {
        query: reportId ? { reportId } : undefined,
      }),
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; reportId: string; config: ReportConfig; isShared: boolean }) =>
      api<SavedReportView>("/reports/views", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-views"] }),
  });
}

export function useUpdateSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      config?: ReportConfig;
      isShared?: boolean;
    }) => api<SavedReportView>(`/reports/views/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-views"] }),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<{ id: number }>(`/reports/views/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-views"] }),
  });
}
