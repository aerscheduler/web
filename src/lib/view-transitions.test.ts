import { describe, expect, it, vi } from "vitest";
import { silenceAbortedViewTransitions } from "@/lib/view-transitions";

/** Just enough of a Document to exercise the wrapper. */
function fakeDoc(transition: { ready: Promise<void>; finished: Promise<void> }) {
  const startViewTransition = vi.fn(() => transition);
  return { startViewTransition } as unknown as Document & {
    startViewTransition: ReturnType<typeof vi.fn>;
  };
}

const settled = () => new Promise((r) => setTimeout(r, 0));

describe("silenceAbortedViewTransitions", () => {
  it("does nothing where the API is missing, rather than throwing", () => {
    expect(() => silenceAbortedViewTransitions(undefined)).not.toThrow();
    expect(() => silenceAbortedViewTransitions({} as Document)).not.toThrow();
  });

  // The whole point: the router discards the ViewTransition, so without this the
  // rejection has no handler and the browser reports it as an uncaught crash.
  it("catches the rejection a skipped transition leaves behind", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);

    const aborted = {
      ready: Promise.reject(new Error("Transition was aborted because of invalid state")),
      finished: Promise.resolve(),
    };
    const doc = fakeDoc(aborted);
    silenceAbortedViewTransitions(doc);

    // Exactly what the router does: call it and throw the result away.
    doc.startViewTransition(() => {});
    await settled();

    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("passes the callback through and returns the transition untouched", () => {
    const transition = { ready: Promise.resolve(), finished: Promise.resolve() };
    const doc = fakeDoc(transition);
    // Hold the original before it is wrapped; afterwards the property is the wrapper.
    const native = doc.startViewTransition;
    silenceAbortedViewTransitions(doc);

    const update = () => {};
    const returned = doc.startViewTransition(update);

    expect(native).toHaveBeenCalledWith(update);
    expect(returned).toBe(transition);
  });

  // `finished` is how a genuinely broken update callback surfaces. Swallowing it would
  // hide a real failure, which is the opposite of what this is for.
  it("leaves `finished` alone so a throwing callback still reports", async () => {
    const boom = new Error("update callback threw");
    const transition = { ready: Promise.resolve(), finished: Promise.reject(boom) };
    const doc = fakeDoc(transition);
    silenceAbortedViewTransitions(doc);

    const returned = doc.startViewTransition(() => {}) as unknown as typeof transition;
    await expect(returned.finished).rejects.toThrow("update callback threw");
  });
});
