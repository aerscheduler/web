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
  CompareMode,
  ReportCatalog,
  ReportConfig,
  ReportOverview,
  ReportRunRequest,
  ReportRunResult,
  SavedReportView,
} from "@/types/reports";
import type {
  DashboardConfig,
  DashboardDocument,
  Visualization,
  VisualizationResult,
} from "@/types/dashboard";
import { MAX_TILES_PER_PANEL, placeAtBottom } from "@/lib/dashboard-layout";
import { DEVICE_TIME_ZONE } from "@/lib/timezone";
import type { ReportSchedule, ScheduleInput } from "@/types/schedules";

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
 * The clock this school's reporting days are measured on.
 *
 * Comes from the server with the catalog, so the console and the engine resolve
 * "Last 30 days" identically — the alternative is each deciding for itself,
 * which is exactly how a tile and its own report came to show different totals.
 *
 * Falls back to the browser's zone only while the catalog is still loading; the
 * server would answer the same in that case, since the device zone is the step
 * it uses when a school has set none.
 */
export function useReportTimeZone(): string {
  const catalog = useReportCatalog();
  return catalog.data?.timeZone ?? DEVICE_TIME_ZONE;
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

/**
 * The Overview — KPI tiles, needs-attention counts and trend series.
 *
 * One request rather than one per tile: the server runs each underlying report
 * once and shares it across the tiles that read from it, which a fan-out of
 * client calls could not do.
 */
export function useReportOverview(
  range: { startDate: string; endDate: string } | null,
  compare: CompareMode
) {
  return useQuery({
    queryKey: ["report-overview", range, compare],
    enabled: !!range,
    queryFn: () =>
      api<ReportOverview>("/reports/overview", {
        query: { startDate: range!.startDate, endDate: range!.endDate, compare },
      }),
    placeholderData: (previous) => previous,
  });
}

// ---------------------------------------------------------------- dashboard

export const DASHBOARD_QUERY_KEY = ["report-dashboard"] as const;

const fetchDashboard = () => api<DashboardDocument>("/reports/dashboard");

/** The caller's dashboard. Falls back to the built-in layout when none is saved. */
export function useDashboard() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: fetchDashboard,
  });
}

/**
 * Recover the dashboard query from a failed load.
 *
 * `refetch()` is the obvious call and it does NOT work here: once a query has
 * settled into an error state React Query keeps serving that state, so the
 * button appeared to do nothing (no request was even made). `resetQueries`
 * clears the error and re-runs the query, which is what "Try again" has to mean.
 */
export function useRetryDashboard() {
  const qc = useQueryClient();
  return () => qc.resetQueries({ queryKey: DASHBOARD_QUERY_KEY });
}

/**
 * Run every visualization in a config.
 *
 * The config is POSTed rather than read from storage so the builder can preview
 * a tile that has not been saved. `placeholderData` keeps the previous numbers
 * on screen while a range change reloads, so dragging a tile doesn't blank the
 * whole board.
 */
export function useDashboardRun(config: DashboardConfig | null) {
  return useQuery({
    queryKey: ["report-dashboard-run", config],
    enabled: !!config,
    queryFn: () =>
      api<{ results: VisualizationResult[] }>("/reports/dashboard/run", {
        method: "POST",
        body: { config },
      }),
    placeholderData: (previous) => previous,
  });
}

export function useSaveDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: DashboardConfig) =>
      api<DashboardDocument>("/reports/dashboard", { method: "PUT", body: { config } }),
    onSuccess: (saved) => {
      // Seed the cache rather than refetching: we already have the saved document.
      qc.setQueryData(["report-dashboard"], saved);
    },
  });
}

/**
 * Add one tile to the saved dashboard, without disturbing the rest of it.
 *
 * Pinning happens from a REPORT, where the board is very likely not loaded and
 * may never have been this session — so this fetches the current document
 * rather than reading whatever is in cache. Read-modify-write on the server's
 * copy is the point: pinning must not resurrect a stale layout the user has
 * since changed in another tab.
 */
export function usePinToDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (viz: Visualization) => {
      const current = await qc.fetchQuery({
        queryKey: DASHBOARD_QUERY_KEY,
        queryFn: fetchDashboard,
      });

      const [panel, ...rest] = current.config.panels;
      if (!panel) throw new Error("Your dashboard has no panel to pin this to");
      if (panel.visualizations.length >= MAX_TILES_PER_PANEL) {
        throw new Error(
          `Your dashboard is full at ${MAX_TILES_PER_PANEL} tiles. Remove one and try again.`
        );
      }

      const config: DashboardConfig = {
        ...current.config,
        panels: [
          {
            ...panel,
            visualizations: [...panel.visualizations, placeAtBottom(panel.visualizations, viz)],
          },
          ...rest,
        ],
      };

      return api<DashboardDocument>("/reports/dashboard", { method: "PUT", body: { config } });
    },
    onSuccess: (saved) => qc.setQueryData(DASHBOARD_QUERY_KEY, saved),
  });
}

/** Discard the saved layout and go back to the built-in one. */
export function useResetDashboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ config: DashboardConfig }>("/reports/dashboard", { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-dashboard"] }),
  });
}

// ------------------------------------------------------------------ schedules

const SCHEDULES_KEY = ["report-schedules"] as const;

/** Every schedule this caller may see — already filtered by report permission. */
export function useReportSchedules() {
  return useQuery({
    queryKey: SCHEDULES_KEY,
    queryFn: () => api<ReportSchedule[]>("/reports/schedules"),
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ScheduleInput) =>
      api<ReportSchedule>("/reports/schedules", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCHEDULES_KEY }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<ScheduleInput> & { id: number }) =>
      api<ReportSchedule>(`/reports/schedules/${id}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCHEDULES_KEY }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<{ id: number }>(`/reports/schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCHEDULES_KEY }),
  });
}

/**
 * Send one now, without consuming its next real delivery.
 *
 * Worth its own button: until it first fires, a weekly schedule is
 * indistinguishable from a broken one for six days.
 */
export function useSendScheduleNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api<{ sent: boolean }>(`/reports/schedules/${id}/send`, { method: "POST" }),
    // The send records lastRunAt and any error on the row.
    onSuccess: () => qc.invalidateQueries({ queryKey: SCHEDULES_KEY }),
  });
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
