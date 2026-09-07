import { describe, expect, it } from "vitest";
import {
  publicBookingIframeSnippet,
  publicBookingModalSnippet,
  publicBookingPageUrl,
} from "./embed-snippets";

describe("embed snippets", () => {
  const page = publicBookingPageUrl("https://app.aerscheduler.com/", "aertest01", "discovery");

  it("builds the share URL without a trailing slash on origin", () => {
    expect(page).toBe("https://app.aerscheduler.com/book/aertest01/discovery");
  });

  it("iframe snippet points at embed=1 and listens for namespaced resize", () => {
    const html = publicBookingIframeSnippet(page);
    expect(html).toContain('src="https://app.aerscheduler.com/book/aertest01/discovery?embed=1"');
    expect(html).toContain("?embed=1&parentOrigin=");
    expect(html).toContain("iframe.aer-book-frame");
    expect(html).toContain("data-aer-book-widget");
    expect(html).toContain("currentScript");
    expect(html).toContain('sandbox="allow-scripts allow-same-origin allow-forms allow-popups"');
    expect(html).toContain('source !== "aerscheduler-book"');
    expect(html).toContain("event.origin !== \"https://app.aerscheduler.com\"");
    expect(html).toContain("event.data.type === \"resize\"");
    expect(html).toContain('minHeight = "0"');
    expect(html).not.toContain("min-height:720px");
    expect(html).not.toContain("<script src=");
  });

  it("modal snippet wraps the same iframe behind a button and closes on submit", () => {
    const html = publicBookingModalSnippet(page);
    expect(html).toContain("data-aer-book-open");
    expect(html).toContain("data-aer-book-modal");
    expect(html).toContain("applyParentOrigin()");
    expect(html).toContain("?embed=1");
    expect(html).toContain('referrerpolicy="origin"');
    expect(html).toContain('type === "request-submitted"');
    expect(html).toContain("modalEl.hidden = true");
    expect(html).not.toContain("min-height:720px");
  });

  it("encodes path segments and escapes quote-bearing URLs in HTML/JS", () => {
    const dirty = publicBookingPageUrl(
      'https://app.aerscheduler.com/"onclick="alert(1)',
      'org"x',
      "off<script>"
    );
    expect(dirty).toContain("org%22x");
    expect(dirty).toContain("off%3Cscript%3E");
    const html = publicBookingIframeSnippet("https://app.aerscheduler.com/book/safe/offering");
    expect(html).toContain("event.source !== frame.contentWindow");
    expect(html).toContain('referrerpolicy="origin"');
    expect(html).not.toContain('iframe[title="Request a flight"]');
  });
});
