import { afterEach, describe, expect, it, vi } from "vitest";
import {
  docsResultPath,
  docsResultUrl,
  docsSnippet,
  loadDocsIndex,
  resetDocsIndexForTests,
  searchDocs,
} from "@/lib/docs-search";

/**
 * The index is written by ANOTHER repo, fetched at runtime from ANOTHER origin.
 * Nothing in this repo's build fails when that contract moves, so what is worth
 * testing is the console's half of it: that a bad payload degrades to an empty
 * group rather than a broken palette, and that one article cannot fill the
 * group with its own headings.
 */

const record = (over: Record<string, unknown>) => ({
  id: "docs:billing/close-out",
  type: "docs",
  title: "Close out a flight",
  href: "/docs/billing/close-out",
  path: ["Documentation", "Billing"],
  ...over,
});

function mockIndex(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => payload }) as unknown as Response)
  );
}

afterEach(() => {
  resetDocsIndexForTests();
  vi.unstubAllGlobals();
});

describe("loadDocsIndex", () => {
  it("keeps documentation and API records and drops the marketing ones", async () => {
    mockIndex({
      records: [
        record({}),
        record({ id: "api:reservations", type: "api", title: "Reservations API", href: "/docs/api/reservations" }),
        record({ id: "page:pricing", type: "page", title: "Pricing", href: "/pricing" }),
        record({ id: "feature:billing", type: "feature", title: "Billing", href: "/features/billing" }),
      ],
    });

    const engine = await loadDocsIndex();
    expect([...engine.byId.keys()]).toEqual(["docs:billing/close-out", "api:reservations"]);
  });

  it("drops a malformed record rather than indexing it", async () => {
    mockIndex({ records: [record({}), { id: "broken", type: "docs" }, null] });

    const engine = await loadDocsIndex();
    expect(engine.byId.size).toBe(1);
  });

  it("rejects a payload with no records, and retries on the next call", async () => {
    mockIndex({ nope: true });
    await expect(loadDocsIndex()).rejects.toThrow(/no records/);

    // The failure must not be cached: a palette opened again has to try again.
    mockIndex({ records: [record({})] });
    await expect(loadDocsIndex()).resolves.toMatchObject({ byId: expect.anything() });
  });
});

describe("searchDocs", () => {
  it("returns one hit per article, not one per matching heading", async () => {
    mockIndex({
      records: [
        record({ body: "Closing out a flight posts the charge." }),
        record({
          id: "docs:billing/close-out#meters",
          title: "Meters at close out",
          href: "/docs/billing/close-out#meters",
          body: "Hobbs in and Hobbs out at close out.",
        }),
        record({
          id: "docs:scheduling/ground",
          title: "Close out a ground lesson",
          href: "/docs/scheduling/ground",
          body: "A ground lesson has no meters to close out.",
        }),
      ],
    });

    // Two records share /docs/billing/close-out. Only the better-scoring one
    // survives, anchor and all, so the hit deep-links to the section that
    // matched rather than the top of the article.
    const hits = searchDocs(await loadDocsIndex(), "close out");
    expect(hits.map((hit) => hit.href)).toEqual([
      "/docs/billing/close-out#meters",
      "/docs/scheduling/ground",
    ]);
  });

  it("honours the cap, and answers an empty query with nothing", async () => {
    mockIndex({
      records: Array.from({ length: 8 }, (_, i) =>
        record({ id: `docs:a/${i}`, href: `/docs/a/${i}`, title: `Billing topic ${i}` })
      ),
    });

    const engine = await loadDocsIndex();
    expect(searchDocs(engine, "billing", 3)).toHaveLength(3);
    expect(searchDocs(engine, "   ")).toEqual([]);
  });
});

describe("presentation", () => {
  it("builds an absolute URL, anchor included", () => {
    expect(docsResultUrl(record({ href: "/docs/billing/close-out#meters" }) as never)).toBe(
      "https://www.aerscheduler.com/docs/billing/close-out#meters"
    );
  });

  it("drops the leading Documentation crumb, which the group heading already says", () => {
    expect(docsResultPath(record({ path: ["Documentation", "Billing", "Invoices"] }) as never)).toEqual(
      ["Billing", "Invoices"]
    );
    expect(docsResultPath(record({ path: ["API reference"] }) as never)).toEqual(["API reference"]);
  });

  it("falls back to body when a heading record has no description", () => {
    expect(docsSnippet(record({ body: "Hobbs in minus Hobbs out." }) as never)).toBe(
      "Hobbs in minus Hobbs out."
    );
    expect(
      docsSnippet(record({ description: "The short one.", body: "The long one." }) as never)
    ).toBe("The short one.");
    expect(docsSnippet(record({ body: "a".repeat(200) }) as never)).toMatch(/\.\.\.$/);
  });
});
