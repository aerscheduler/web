/**
 * Stop a skipped view transition from being reported as a crash.
 *
 * `defaultViewTransition` in main.tsx has the router call `document.startViewTransition()`,
 * and the router throws away the `ViewTransition` it gets back. Nothing is left holding its
 * promises, so when a transition is skipped its `ready` rejects into nowhere and the browser
 * raises "Uncaught (in promise) InvalidStateError: Transition was aborted because of invalid
 * state".
 *
 * Skipping is not an error condition here, it is the normal case. A transition is dropped
 * whenever a second navigation starts before the first has finished animating, which this
 * console does constantly: preloading on intent, the session watcher's redirect, and the
 * thirty-odd `navigate({ replace: true })` calls that normalise search params the instant a
 * list or a detail tab mounts. The navigation completes correctly every time; only the
 * animation was dropped.
 *
 * That would be harmless noise except `capture_exceptions` is on, so each one is sent to
 * PostHog as an `$exception`. Crash reporting was turned on to tell a console that throws on
 * load from a console nobody opened, and a routine abort firing on ordinary navigation
 * buries exactly that signal. Hence a catch rather than turning the animation off.
 *
 * Only `ready` is caught. A skipped transition still RESOLVES `finished`, so nothing is lost
 * by leaving that one alone, and `finished` is what rejects when the update callback itself
 * throws. That is a real failure and must keep reaching the console and PostHog.
 */
export function silenceAbortedViewTransitions(doc: Document | undefined = globalThis.document) {
  if (!doc || typeof doc.startViewTransition !== "function") return;

  const start = doc.startViewTransition.bind(doc);
  doc.startViewTransition = ((...args: Parameters<typeof start>) => {
    const transition = start(...args);
    void transition.ready.catch(() => {});
    return transition;
  }) as typeof doc.startViewTransition;
}
