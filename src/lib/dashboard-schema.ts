/**
 * A client-side mirror of the server's dashboard schema.
 *
 * The server validates every config on write and on read regardless, this is
 * not the safety net. It exists so the builder can catch a bad configuration
 * BEFORE sending it, and point at the field, rather than turning a server 400
 * into a toast that says "that didn't work".
 *
 * Because it is a mirror, it can drift. The rule is that the server is the
 * authority: if these ever disagree, the server wins and the user sees its
 * message. Keeping the two in step is why the constraints here are written in
 * the same order and the same words as `server/src/reports/dashboard/schema.ts`.
 */

import { z } from "zod";
import { VIZ_TYPES } from "@/types/dashboard";

const namedRange = z.enum([
  "past7",
  "past30",
  "past90",
  "monthToDate",
  "yearToDate",
  "next30",
  "next90",
]);

const isoString = z
  .string()
  .max(40)
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: "not a valid date" });

const rangeSpec = z.union([namedRange, z.object({ startDate: isoString, endDate: isoString })]);

const filterInput = z.object({
  key: z.string().min(1).max(64),
  operator: z.enum([
    "eq", "ne", "gt", "gte", "lt", "lte",
    "contains", "startsWith", "in", "notIn",
    "isNull", "isNotNull", "between",
  ]),
  value: z
    .union([
      z.string().max(200),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).max(50),
    ])
    .optional(),
});

const layout = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(200),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(8),
});

export const visualizationSchema = z
  .object({
    id: z.string().min(1).max(40),
    title: z.string().max(60).optional(),
    viz: z.enum(VIZ_TYPES),
    reportId: z.string().min(1).max(60),
    metrics: z.array(z.string().min(1).max(64)).min(1).max(6),
    dimension: z.string().min(1).max(64).optional(),
    filters: z.array(filterInput).max(20).default([]),
    range: z.union([z.literal("inherit"), rangeSpec]).default("inherit"),
    compare: z.enum(["inherit", "previous", "lastYear", "none"]).default("inherit"),
    layout,
  })
  .superRefine((viz, ctx) => {
    const fail = (message: string, path: string) =>
      ctx.addIssue({ code: "custom", message, path: [path] });

    switch (viz.viz) {
      case "metric":
        if (viz.metrics.length !== 1) fail("Pick exactly one metric", "metrics");
        if (viz.dimension) fail("A number card can't be grouped", "dimension");
        break;
      case "line":
        if (!viz.dimension) fail("Pick what the x-axis should be", "dimension");
        if (viz.metrics.length > 3) fail("Up to three metrics on a line chart", "metrics");
        break;
      case "bar":
        if (!viz.dimension) fail("Pick what to rank by", "dimension");
        if (viz.metrics.length !== 1) fail("A bar chart ranks one metric", "metrics");
        break;
      case "table":
        break;
    }
  });

export const panelSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().max(60).optional(),
  range: rangeSpec.default("past30"),
  compare: z.enum(["previous", "lastYear", "none"]).default("previous"),
  segment: z.array(filterInput).max(20).default([]),
  visualizations: z.array(visualizationSchema).max(40).default([]),
});

export const dashboardConfigSchema = z.object({
  version: z.literal(1),
  panels: z.array(panelSchema).min(1).max(10),
});

/**
 * Validate before sending. Returns the first problem in plain words, or null.
 *
 * Deliberately returns ONE message: a builder form has one thing wrong at a
 * time in practice, and a list of six Zod paths is not something anyone reads.
 */
export function firstProblem(config: unknown): string | null {
  const parsed = dashboardConfigSchema.safeParse(config);
  if (parsed.success) return null;
  const issue = parsed.error.issues[0];
  return issue?.message ?? "That layout isn't valid";
}
