// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createBrowserHistory, type RouterHistory } from "@tanstack/history";
import type { AnyRouter } from "@tanstack/react-router";
import { previousPage, startBackTrail } from "./back-trail";

let history: RouterHistory;

/** Land on a page the way the console does: navigate, then the route names the tab. */
function visit(href: string, title: string, how: "push" | "replace" = "push") {
  history[how](href);
  document.title = `${title} · AerScheduler`;
  return new Promise((r) => setTimeout(r, 0));
}

/** A full document load (an org switch, a return from Stripe): the router starts over at 0. */
function reloadDocument(href: string, title: string) {
  history.destroy();
  window.history.pushState(null, "", href);
  history = createBrowserHistory();
  document.title = `${title} · AerScheduler`;
  startBackTrail({ history } as unknown as AnyRouter);
  return new Promise((r) => setTimeout(r, 0));
}

function back(n: number) {
  history.go(-n);
  return new Promise((r) => setTimeout(r, 20));
}

describe("back-trail", () => {
  beforeEach(async () => {
    history?.destroy();
    window.sessionStorage.clear();
    window.localStorage.clear();
    document.head.innerHTML = "<title>AerScheduler</title>";
    window.history.replaceState(null, "", "/people");
    history = createBrowserHistory();
    document.title = "People · AerScheduler";
    startBackTrail({ history } as unknown as AnyRouter);
    await new Promise((r) => setTimeout(r, 0));
  });

  it("has nothing behind the first page of a session", () => {
    expect(previousPage()).toBeNull();
  });

  it("names the page you came from, filters and all", async () => {
    await visit("/maintenance?group=status", "Maintenance");
    await visit("/maintenance/inspections/9", "Annual");
    expect(previousPage()).toMatchObject({
      entry: { href: "/maintenance?group=status", pathname: "/maintenance", title: "Maintenance" },
      steps: 1,
    });
  });

  it("keeps the origin through the record's own tab changes, pushed or replaced", async () => {
    await visit("/aircraft/131", "N172TS");
    await visit("/aircraft/131?tab=maintenance", "N172TS", "replace");
    await visit("/aircraft/131?tab=squawks", "N172TS");
    expect(previousPage()).toMatchObject({ entry: { pathname: "/people", title: "People" }, steps: 2 });
  });

  it("takes the record's name, which arrives after the route's label", async () => {
    await visit("/people/5", "People");
    document.title = "Jane Doe · AerScheduler";
    await new Promise((r) => setTimeout(r, 0));
    await visit("/aircraft/131", "N172TS");
    expect(previousPage()?.entry.title).toBe("Jane Doe");
  });

  it("falls back when the page behind is not the console", async () => {
    await visit("/login", "Sign in");
    await visit("/aircraft/131", "N172TS");
    expect(previousPage()).toBeNull();
  });

  it("follows where a page was reached from, not what sits one index lower", async () => {
    await visit("/aircraft/131", "N172TS");
    await visit("/people/5", "Jane Doe");
    await back(1); // on N172TS again
    await visit("/maintenance", "Maintenance"); // replaces Jane in the browser's stack
    expect(previousPage()).toMatchObject({ entry: { pathname: "/aircraft/131" }, steps: 1 });
  });

  it("starts over after a full document load, so a lower index from the old document never answers", async () => {
    await visit("/aircraft/131", "N172TS");
    await reloadDocument("/", "AerScheduler");
    await visit("/people/5", "Jane Doe");
    // Index 0 of the new document is "/", not a console page: nothing to go back to.
    expect(previousPage()).toBeNull();
  });

  it("forgets everything on sign-out", async () => {
    await visit("/people/5", "Jane Doe");
    window.dispatchEvent(new CustomEvent("aer:token-change")); // no token stored: signed out
    expect(window.sessionStorage.getItem("aer.back-trail")).toBeNull();
  });
});
