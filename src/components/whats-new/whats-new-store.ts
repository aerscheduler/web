import { useSyncExternalStore } from "react";
import type { WhatsNewEntry, WhatsNewSurface } from "@/types/whats-new";

/**
 * Whether the What's new window is open, and on which update. Module state rather than context
 * because two unrelated places open it (the rail card and the organization menu) and one host
 * draws it.
 */
type State = {
  open: boolean;
  id: string | null;
  surface: WhatsNewSurface;
  /**
   * The developer page's preview: show these entries instead of the caller's own, and record
   * nothing. How a developer reads a draft written for students while signed in as an owner.
   */
  preview: WhatsNewEntry[] | null;
};

let state: State = { open: false, id: null, surface: "console_menu", preview: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const whatsNewWindow = {
  open(id: string | null, surface: WhatsNewSurface, preview: WhatsNewEntry[] | null = null) {
    state = { open: true, id, surface, preview };
    emit();
  },
  select(id: string) {
    state = { ...state, id };
    emit();
  },
  close() {
    state = { ...state, open: false };
    emit();
  },
};

export function useWhatsNewWindow(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state
  );
}
