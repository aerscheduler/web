/**
 * The question asked whenever unsaved dashboard layout work is about to be
 * thrown away, leaving the route, closing the tab, or swapping Overview for a
 * report in the rail. One wording, wherever the exit is.
 *
 * Its own module on purpose: exporting a non-component from `dashboard.tsx`
 * breaks React Fast Refresh for that file, so every edit full-reloads and
 * silently drops the state you were mid-way through testing.
 */
export const DISCARD_DASHBOARD_EDITS = {
  title: "Leave without saving?",
  description:
    "Your dashboard changes haven't been saved yet. Leaving now discards them.",
  confirmLabel: "Discard changes",
  cancelLabel: "Keep editing",
  destructive: true,
} as const;
