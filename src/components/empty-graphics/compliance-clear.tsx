import { EmptyGraphicSvg } from "./graphic-svg";

export function ComplianceClearEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="61.5 48.5 121 138" className={className}>
      {/* Runway from above: long pad, dashed centerline, threshold bars. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="52" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="90" y="52" width="64" height="116" rx="6" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="86" y="48" width="64" height="116" rx="6" />
          <path d="M118 60v92" opacity="0.65" strokeWidth="1.7" strokeDasharray="7 6" />
          <path d="M96 150h10 M96 142h10 M130 150h10 M130 142h10" strokeWidth="1.7" />
        </g>
    </EmptyGraphicSvg>
  );
}
