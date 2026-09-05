import { EmptyGraphicSvg } from "./graphic-svg";

export function InvoicesEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="57.5 25.5 121 164" className={className}>
      {/* You / Invoices, "No invoices yet". Folded invoice, perforated stub, blank total. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="118" cy="178" rx="58" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="82" y="52" width="92" height="116" rx="8" opacity="0.22" />
          <rect x="76" y="46" width="92" height="116" rx="8" opacity="0.36" />
          <rect x="70" y="40" width="92" height="116" rx="8" opacity="0.55" />
          <path d="M74 28H132L154 50V140A8 8 0 0 1 146 148H74A8 8 0 0 1 66 140V36A8 8 0 0 1 74 28Z" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M74 28H132L154 50V140A8 8 0 0 1 146 148H74A8 8 0 0 1 66 140V36A8 8 0 0 1 74 28Z" />
          <path d="M132 28V50H154" />
          <path d="M132 50L154 28" opacity="0.45" strokeWidth="1.6" />
          <path d="M88 40V140" opacity="0.7" strokeDasharray="2.4 3.2" strokeWidth="1.7" />
          <path d="M84 52h8M84 68h8M84 84h8M84 100h8M84 116h8M84 132h8" opacity="0.4" strokeWidth="1.5" />
          <rect x="70" y="40" width="12" height="16" rx="2" opacity="0.55" strokeWidth="1.5" />
          <path d="M100 62h36" opacity="0.5" strokeWidth="1.7" />
          <path d="M100 76h28" opacity="0.45" strokeWidth="1.6" />
          <path d="M100 90h32" opacity="0.45" strokeWidth="1.6" />
          <path d="M100 104h24" opacity="0.4" strokeWidth="1.5" />
          <path d="M98 126h42" />
          <path d="M98 134h42" opacity="0.55" strokeWidth="1.6" />
        </g>
    </EmptyGraphicSvg>
  );
}
