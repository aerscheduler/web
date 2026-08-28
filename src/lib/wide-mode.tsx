import * as React from "react";

/**
 * "Wide" is one preference about YOUR MONITOR, honoured by the screens that can use it.
 *
 * Two separate things, and keeping them separate is the whole design:
 *
 *   The PREFERENCE is global. It is a fact about the screen you are sitting at, not about
 *   a page. Remembering it per page would mean setting it on the calendar, navigating to
 *   reports, finding it narrow, setting it again, and so on for every screen you use. You
 *   would toggle it eight times to lay out a workspace and it would feel broken each time
 *   you navigated.
 *
 *   WHICH SCREENS HONOUR IT is per page, because that is a fact about the content. A
 *   settings form does not read better at 1900px whatever monitor it is on. A page opts in
 *   with `<PageHeader wide />`, and pages that do not are simply left alone.
 *
 * PER DEVICE, deliberately, which is why this is localStorage and not a column on the
 * user. Somebody with a 27 inch monitor at their desk and a 13 inch laptop on the road
 * wants two different answers, and syncing the preference would make that actively worse.
 *
 * And NOT in the URL: a link you send a colleague should not impose your window on them.
 * Same line the inbox draws for `transientKeys`, the record it has open is shareable state,
 * how wide you like your screen is not.
 *
 * Wide is a BIGGER CAP, not no cap. Uncapped on an ultrawide gave a header whose title sat
 * at one end of a 3000px row and whose buttons sat at the other, with a metre of nothing
 * between them: technically using the space, unreadable in practice. `WIDE_MAX_PX` fills a
 * 1920 monitor exactly once the nav rail is taken off it, and holds the line past that.
 * Components that need a tighter reading measure still set their own (`max-w-prose` on the
 * squawk write-up).
 */

/**
 * 1920 minus the 240px nav rail. A very common monitor is then filled edge to edge with no
 * gutter, and anything bigger keeps a margin rather than stretching a header across a
 * desk. Mirrored in `app-shell.tsx` as a Tailwind arbitrary value, which cannot read a
 * constant, so the two have to be changed together.
 */
export const WIDE_MAX_PX = 1680;

/**
 * The width at which wide is the better DEFAULT for somebody who has never chosen.
 *
 * The 1280 cap only starts wasting space once the window minus the nav rail exceeds it, so
 * roughly 1520px. A little above that is where the gain is worth defaulting to.
 *
 * This is a default, never an override. The moment somebody toggles, their answer is
 * stored and this stops being consulted; a preference that quietly re-decides itself when
 * you dock a laptop is worse than one that is simply wrong once.
 */
const WIDE_BY_DEFAULT_PX = 1600;

type WideMode = {
  wide: boolean;
  setWide: (wide: boolean) => void;
  toggle: () => void;
};

const WideModeContext = React.createContext<WideMode | null>(null);

const STORAGE_KEY = "aer.wide";

/** A stored choice wins. Absent, guess from the screen this browser is actually on. */
function readStoredOrGuess(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw != null) return JSON.parse(raw) as boolean;
  } catch {
    // Unreadable storage, fall through to the guess.
  }
  return window.innerWidth >= WIDE_BY_DEFAULT_PX;
}

export function WideModeProvider({ children }: { children: React.ReactNode }) {
  // Not `usePersistedState`: that writes the default on mount, which would freeze whatever
  // this browser guessed on first load and stop the guess ever improving. Nothing is
  // written until somebody actually chooses, so "never chosen" stays distinguishable from
  // "chose narrow".
  const [wide, setWideState] = React.useState<boolean>(readStoredOrGuess);

  const setWide = React.useCallback((next: boolean) => {
    setWideState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota or private mode. The preference still applies for this session.
    }
  }, []);

  const toggle = React.useCallback(() => setWideState((w) => {
    const next = !w;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* see above */
    }
    return next;
  }), []);

  // A power-user toggle deserves a key. Meta/Ctrl + backslash, which nothing in the browser
  // or the console claims, and which is close enough to the window-management keys that it
  // reads as "change my layout" rather than "do something to this record".
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "\\" || !(e.metaKey || e.ctrlKey)) return;
      // Only where it would do something. Firing on a settings page would toggle a
      // preference with no visible effect, which reads as a broken shortcut.
      if (!document.querySelector("[data-wide-ok]")) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = React.useMemo(() => ({ wide, setWide, toggle }), [wide, setWide, toggle]);

  return <WideModeContext.Provider value={value}>{children}</WideModeContext.Provider>;
}

/**
 * Outside the provider this reports "narrow, and you cannot change it", rather than
 * throwing. The provider lives in the app shell, and a component rendered in a test or a
 * storybook without it should still render.
 */
export function useWideMode(): WideMode {
  return (
    React.useContext(WideModeContext) ?? {
      wide: false,
      setWide: () => {},
      toggle: () => {},
    }
  );
}
