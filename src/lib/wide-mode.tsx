import * as React from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";

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
 * Note "wide" means UNCAPPED, not a bigger number. A table genuinely uses 3000px on an
 * ultrawide; a paragraph never should, so components that need a reading measure set their
 * own (see `max-w-prose` on the squawk write-up). One bigger cap cannot serve both.
 */

type WideMode = {
  wide: boolean;
  setWide: (wide: boolean) => void;
  toggle: () => void;
};

const WideModeContext = React.createContext<WideMode | null>(null);

const STORAGE_KEY = "aer.wide";

export function WideModeProvider({ children }: { children: React.ReactNode }) {
  const [wide, setWide] = usePersistedState<boolean>(STORAGE_KEY, false);

  const toggle = React.useCallback(() => setWide((w) => !w), [setWide]);

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

  const value = React.useMemo(
    () => ({ wide, setWide: (next: boolean) => setWide(next), toggle }),
    [wide, setWide, toggle]
  );

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
