import { EmptyGraphicSvg } from "./graphic-svg";

export function BookingOfferingsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="67.5 44.5 117 142" className={className}>
      {/* Settings / Booking offerings. Three ticket stubs. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="126" cy="178" rx="52" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="92" y="92" width="88" height="52" rx="8" opacity="0.28" />
          <rect x="84" y="78" width="88" height="52" rx="8" opacity="0.5" />
          <rect x="76" y="64" width="88" height="52" rx="8" />
          <circle cx="76" cy="90" r="6" />
          <path d="M92 78v38" opacity="0.45" strokeWidth="1.7" strokeDasharray="3.5 4" />
          <path d="M104 82h44" opacity="0.45" strokeWidth="1.7" />
          <path d="M104 96h32" opacity="0.45" strokeWidth="1.7" />
        </g>
    </EmptyGraphicSvg>
  );
}
