import { describe, expect, it, vi } from "vitest";
import {
  embedPostTargetOrigin,
  frameAncestorsCsp,
  parentMayEmbed,
  parseEmbedParentOriginQuery,
  parsePublicBookingEmbedHosts,
} from "./public-booking-embed-hosts";
import { bookFrameAncestorsHeader, publicBookPathMatch, publicBookingApiOrigin } from "./public-booking-csp";

describe("parsePublicBookingEmbedHosts", () => {
  it("accepts a host and stores the https origin", () => {
    expect(parsePublicBookingEmbedHosts("www.flynow.com\nflynow.com")).toEqual({
      origins: ["https://www.flynow.com", "https://flynow.com"],
    });
  });

  it("rejects paths, wildcards, and http on public hosts", () => {
    expect(parsePublicBookingEmbedHosts("https://flynow.com/book")).toEqual({
      error: "Use the site host only, like www.yourschool.com, not a full page URL.",
    });
    expect(parsePublicBookingEmbedHosts("*.flynow.com")).toEqual({
      error: "Wildcards are not allowed. Use the exact host, like www.yourschool.com.",
    });
    expect(parsePublicBookingEmbedHosts("http://flynow.com")).toEqual({
      error: "Public websites must use https.",
    });
  });

  it("keeps localhost with a port for local iframe tests", () => {
    expect(parsePublicBookingEmbedHosts("http://localhost:5173")).toEqual({
      origins: ["http://localhost:5173"],
    });
  });

  it("rejects numbers, scheme-relative hosts, and IPv4 forms", () => {
    expect(parsePublicBookingEmbedHosts([1 as unknown as string])).toEqual({
      error: "Embed websites must be a list of hosts.",
    });
    expect(parsePublicBookingEmbedHosts("//evil.com")).toEqual({
      error: '"//evil.com" is not a website host.',
    });
    expect(parsePublicBookingEmbedHosts("1.1")).toEqual({
      error: '"1.1" is not a website host.',
    });
    expect(parsePublicBookingEmbedHosts("https://10.0.0.1")).toEqual({
      error: '"https://10.0.0.1" is not a website host.',
    });
  });
});

describe("parentMayEmbed", () => {
  it("allows the hosted tab even with an empty allowlist", () => {
    expect(
      parentMayEmbed({
        framed: false,
        parentOrigin: null,
        allowedOrigins: [],
        selfOrigin: "https://app.aerscheduler.com",
      })
    ).toBe(true);
  });

  it("refuses an unknown parent when the list is empty", () => {
    expect(
      parentMayEmbed({
        framed: true,
        parentOrigin: "https://evil.example",
        allowedOrigins: [],
        selfOrigin: "https://app.aerscheduler.com",
      })
    ).toBe(false);
  });

  it("allows a listed parent", () => {
    expect(
      parentMayEmbed({
        framed: true,
        parentOrigin: "https://www.flynow.com",
        allowedOrigins: ["https://www.flynow.com"],
        selfOrigin: "https://app.aerscheduler.com",
      })
    ).toBe(true);
  });

  it("lets CSP decide when the parent origin is unknown and a site is listed", () => {
    expect(
      parentMayEmbed({
        framed: true,
        parentOrigin: null,
        allowedOrigins: ["https://www.flynow.com"],
        selfOrigin: "https://app.aerscheduler.com",
      })
    ).toBe(true);
  });

  it("hides the picker when the parent is unknown and nobody may embed", () => {
    expect(
      parentMayEmbed({
        framed: true,
        parentOrigin: null,
        allowedOrigins: [],
        selfOrigin: "https://app.aerscheduler.com",
      })
    ).toBe(false);
  });

  it("refuses a listed origin that is not the discovered parent", () => {
    expect(
      parentMayEmbed({
        framed: true,
        parentOrigin: "https://evil.example",
        allowedOrigins: ["https://www.flynow.com"],
        selfOrigin: "https://app.aerscheduler.com",
      })
    ).toBe(false);
  });

  it("hides the picker when the HTML document was not loaded as /book", () => {
    expect(
      parentMayEmbed({
        framed: true,
        parentOrigin: null,
        allowedOrigins: ["https://www.flynow.com"],
        selfOrigin: "https://app.aerscheduler.com",
        htmlDocumentIsGuestBook: false,
      })
    ).toBe(false);
  });
});

describe("embedPostTargetOrigin", () => {
  const self = "https://app.aerscheduler.com";
  const school = "https://www.flynow.com";

  it("prefers the discovered parent over a spoofed query", () => {
    expect(
      embedPostTargetOrigin({
        discoveredParent: self,
        queryParentOrigin: school,
        allowedOrigins: [school],
        selfOrigin: self,
      })
    ).toBe(self);
  });

  it("uses a listed query origin when the parent cannot be discovered", () => {
    expect(
      embedPostTargetOrigin({
        discoveredParent: null,
        queryParentOrigin: school,
        allowedOrigins: [school],
        selfOrigin: self,
      })
    ).toBe(school);
  });

  it("uses this app origin from the query for same-origin preview", () => {
    expect(
      embedPostTargetOrigin({
        discoveredParent: null,
        queryParentOrigin: self,
        allowedOrigins: [],
        selfOrigin: self,
      })
    ).toBe(self);
  });

  it("ignores an unlisted query origin", () => {
    expect(
      embedPostTargetOrigin({
        discoveredParent: null,
        queryParentOrigin: "https://evil.example",
        allowedOrigins: [school],
        selfOrigin: self,
      })
    ).toBeNull();
  });
});

describe("parseEmbedParentOriginQuery", () => {
  it("accepts a local origin and rejects a path", () => {
    expect(parseEmbedParentOriginQuery("?embed=1&parentOrigin=http%3A%2F%2F127.0.0.1%3A43721")).toBe(
      "http://127.0.0.1:43721"
    );
    expect(parseEmbedParentOriginQuery("parentOrigin=https://www.flynow.com/book")).toBeNull();
  });
});

describe("frameAncestorsCsp", () => {
  it("always includes self so the hosted page can preview embed=1", () => {
    expect(frameAncestorsCsp([])).toBe("frame-ancestors 'self'");
    expect(frameAncestorsCsp(["https://www.flynow.com"])).toBe(
      "frame-ancestors 'self' https://www.flynow.com"
    );
    expect(frameAncestorsCsp(["*", "https://www.flynow.com"])).toBe(
      "frame-ancestors 'self' https://www.flynow.com"
    );
  });
});

describe("publicBookPathMatch", () => {
  it("reads org and offering slugs", () => {
    expect(publicBookPathMatch("/book/aertest01/discovery")).toEqual({
      orgSlug: "aertest01",
      offeringSlug: "discovery",
    });
  });

  it("ignores the confirm page", () => {
    expect(publicBookPathMatch("/book/confirm")).toBeNull();
  });
});

describe("bookFrameAncestorsHeader", () => {
  it("fails closed to self when the public page cannot be fetched", async () => {
    const header = await bookFrameAncestorsHeader(
      new Request("https://app.aerscheduler.com/book/missing/discovery"),
      { VITE_API_URL: "https://api.example.invalid" }
    );
    expect(header).toBe("frame-ancestors 'self'");
  });

  it("leaves non-book routes alone", async () => {
    const header = await bookFrameAncestorsHeader(
      new Request("https://app.aerscheduler.com/schedule")
    );
    expect(header).toBeNull();
  });

  it("does not treat /me/book as a guest page", async () => {
    const header = await bookFrameAncestorsHeader(
      new Request("https://app.aerscheduler.com/me/book")
    );
    expect(header).toBeNull();
  });

  it("stamps listed hosts onto frame-ancestors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { organization: { embedHosts: ["https://www.flynow.com"] } } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const req = new Request("https://app.aerscheduler.com/book/school/discovery");
      const header = await bookFrameAncestorsHeader(req);
      expect(header).toBe("frame-ancestors 'self' https://www.flynow.com");
      await bookFrameAncestorsHeader(req);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("keeps the last allowlist when a later fetch fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T00:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { organization: { embedHosts: ["https://www.flynow.com"] } } }),
      })
      .mockRejectedValueOnce(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const req = new Request("https://app.aerscheduler.com/book/stale-school/discovery");
      await bookFrameAncestorsHeader(req);
      vi.setSystemTime(new Date("2026-09-06T00:00:30.000Z"));
      const header = await bookFrameAncestorsHeader(req);
      expect(header).toBe("frame-ancestors 'self' https://www.flynow.com");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("fails closed once the stale allowlist is older than a minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T00:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { organization: { embedHosts: ["https://www.flynow.com"] } } }),
      })
      .mockRejectedValueOnce(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const req = new Request("https://app.aerscheduler.com/book/expired-stale/discovery");
      await bookFrameAncestorsHeader(req);
      vi.setSystemTime(new Date("2026-09-06T00:03:00.000Z"));
      const header = await bookFrameAncestorsHeader(req);
      expect(header).toBe("frame-ancestors 'self'");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });
});

describe("publicBookingApiOrigin", () => {
  it("uses the local API only for loopback hostnames", () => {
    expect(publicBookingApiOrigin("http://localhost:5173/book/a/b")).toBe("http://127.0.0.1:5001");
    expect(publicBookingApiOrigin("https://localhost-staging.example.com/book/a/b")).toBe(
      "https://api.aerscheduler.com"
    );
  });
});
