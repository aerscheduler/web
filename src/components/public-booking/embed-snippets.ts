import { PUBLIC_BOOKING_EMBED_SOURCE } from "@/lib/public-booking-embed-hosts";

const IFRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";
const IFRAME_STYLE =
  "width:100%;min-height:200px;height:640px;border:0;border-radius:12px;";

function escapeHtmlAttr(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeJsString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, "\\x22").replace(/</g, "\\x3c");
}

export function publicBookingPageUrl(origin: string, orgSlug: string, offeringSlug: string) {
  const base = origin.replace(/\/$/, "");
  return `${base}/book/${encodeURIComponent(orgSlug)}/${encodeURIComponent(offeringSlug)}`;
}

function iframeMarkup(pageUrl: string) {
  const src = `${pageUrl}?embed=1`;
  return `<iframe class="aer-book-frame" src="${escapeHtmlAttr(src)}" title="Request a flight" referrerpolicy="origin" sandbox="${IFRAME_SANDBOX}" style="${IFRAME_STYLE}"></iframe>`;
}

function setParentOriginScript(pageUrl: string, extraOnMessage: string) {
  const pageJs = escapeJsString(pageUrl);
  const originJs = escapeJsString(new URL(pageUrl).origin);
  return `<script>
(function () {
  var page = "${pageJs}";
  var widget = document.currentScript && document.currentScript.parentElement;
  if (!widget || !widget.getAttribute || !widget.hasAttribute("data-aer-book-widget")) {
    widget = document.querySelector("[data-aer-book-widget]");
  }
  var frame = widget ? widget.querySelector("iframe.aer-book-frame") : null;
  function applyParentOrigin() {
    if (frame) {
      frame.src = page + "?embed=1&parentOrigin=" + encodeURIComponent(window.location.origin);
    }
  }
  applyParentOrigin();
  window.addEventListener("message", function (event) {
    if (event.origin !== "${originJs}") return;
    if (!event.data || event.data.source !== "${PUBLIC_BOOKING_EMBED_SOURCE}") return;
    if (frame && event.source !== frame.contentWindow) return;
    var height = Number(event.data.height);
    if (event.data.type === "resize" && frame && Number.isFinite(height)) {
      frame.style.minHeight = "0";
      frame.style.height = Math.min(Math.max(height, 200), 4000) + "px";
    }
    ${extraOnMessage}
  });
})();
</script>`;
}

export function publicBookingIframeSnippet(pageUrl: string) {
  return `<div data-aer-book-widget>
${iframeMarkup(pageUrl)}
${setParentOriginScript(pageUrl, "")}</div>`;
}

export function publicBookingModalSnippet(pageUrl: string) {
  const closeOnSubmit = `if (event.data.type === "request-submitted") {
      var modalEl = widget && widget.querySelector("[data-aer-book-modal]");
      if (modalEl) modalEl.hidden = true;
      applyParentOrigin();
    }`;
  return `<div data-aer-book-widget>
<button type="button" data-aer-book-open>Request a flight</button>
<div data-aer-book-modal hidden style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;padding:24px;">
  <div style="margin:0 auto;max-width:960px;background:#fff;border-radius:12px;overflow:auto;max-height:100%;">
    <button type="button" data-aer-book-close style="margin:12px;">Close</button>
    ${iframeMarkup(pageUrl)}
  </div>
</div>
<script>
(function () {
  var widget = document.currentScript && document.currentScript.parentElement;
  if (!widget || !widget.getAttribute || !widget.hasAttribute("data-aer-book-widget")) {
    widget = document.querySelector("[data-aer-book-widget]");
  }
  var modal = widget && widget.querySelector("[data-aer-book-modal]");
  var frame = widget && widget.querySelector("iframe.aer-book-frame");
  var page = "${escapeJsString(pageUrl)}";
  function resetFrame() {
    if (frame) {
      frame.src = page + "?embed=1&parentOrigin=" + encodeURIComponent(window.location.origin);
    }
  }
  widget && widget.querySelector("[data-aer-book-open]")?.addEventListener("click", function () {
    if (modal) modal.hidden = false;
  });
  widget && widget.querySelector("[data-aer-book-close]")?.addEventListener("click", function () {
    if (modal) modal.hidden = true;
    resetFrame();
  });
})();
</script>
${setParentOriginScript(pageUrl, closeOnSubmit)}</div>`;
}
