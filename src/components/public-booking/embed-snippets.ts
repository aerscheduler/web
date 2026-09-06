const EMBED_SOURCE = "aerscheduler-book";

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

export function publicBookingIframeSnippet(pageUrl: string) {
  const src = `${pageUrl}?embed=1`;
  const origin = new URL(pageUrl).origin;
  const srcAttr = escapeHtmlAttr(src);
  const originJs = escapeJsString(origin);
  return `<iframe src="${srcAttr}" title="Request a flight" referrerpolicy="origin" style="width:100%;min-height:720px;border:0;border-radius:12px;"></iframe>
<script>
window.addEventListener("message", function (event) {
  if (event.origin !== "${originJs}") return;
  if (!event.data || event.data.source !== "${EMBED_SOURCE}") return;
  var frame = null;
  var frames = document.querySelectorAll("iframe");
  for (var i = 0; i < frames.length; i++) {
    if (frames[i].contentWindow === event.source) {
      frame = frames[i];
      break;
    }
  }
  var height = Number(event.data.height);
  if (event.data.type === "resize" && frame && Number.isFinite(height)) {
    frame.style.height = Math.min(Math.max(height, 200), 4000) + "px";
  }
});
</script>`;
}

export function publicBookingModalSnippet(pageUrl: string) {
  const src = `${pageUrl}?embed=1`;
  const origin = new URL(pageUrl).origin;
  const srcAttr = escapeHtmlAttr(src);
  const originJs = escapeJsString(origin);
  return `<button type="button" data-aer-book-open>Request a flight</button>
<div id="aer-book-modal" hidden style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;padding:24px;">
  <div style="margin:0 auto;max-width:960px;background:#fff;border-radius:12px;overflow:auto;max-height:100%;">
    <button type="button" data-aer-book-close style="margin:12px;">Close</button>
    <iframe src="${srcAttr}" title="Request a flight" referrerpolicy="origin" style="width:100%;min-height:720px;border:0;"></iframe>
  </div>
</div>
<script>
(function () {
  var modal = document.getElementById("aer-book-modal");
  document.querySelector("[data-aer-book-open]")?.addEventListener("click", function () {
    if (modal) modal.hidden = false;
  });
  document.querySelector("[data-aer-book-close]")?.addEventListener("click", function () {
    if (modal) modal.hidden = true;
  });
  window.addEventListener("message", function (event) {
    if (event.origin !== "${originJs}") return;
    if (!event.data || event.data.source !== "${EMBED_SOURCE}") return;
    var frame = null;
    var frames = document.querySelectorAll("iframe");
    for (var i = 0; i < frames.length; i++) {
      if (frames[i].contentWindow === event.source) {
        frame = frames[i];
        break;
      }
    }
    var height = Number(event.data.height);
    if (event.data.type === "resize" && frame && Number.isFinite(height)) {
      frame.style.height = Math.min(Math.max(height, 200), 4000) + "px";
    }
  });
})();
</script>`;
}
