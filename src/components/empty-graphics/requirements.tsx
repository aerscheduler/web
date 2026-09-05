import { EmptyGraphicSvg } from "./graphic-svg";

export function RequirementsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="54 48 124 138" className={className}>
      {/* Training / Requirements, "No requirements".
             Tight viewBox is the ink bounding box. Stroke currentColor, fill none. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="120" cy="175" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="68" y="62" width="104" height="18" rx="9" opacity="0.22" />
          <rect x="68" y="96" width="104" height="18" rx="9" opacity="0.22" />
          <rect x="68" y="130" width="104" height="18" rx="9" opacity="0.22" />
          <rect x="62" y="56" width="104" height="18" rx="9" opacity="0.42" />
          <rect x="62" y="90" width="104" height="18" rx="9" opacity="0.42" />
          <rect x="62" y="124" width="104" height="18" rx="9" opacity="0.42" />
          <rect x="56" y="50" width="104" height="18" rx="9" />
          <rect x="56" y="84" width="104" height="18" rx="9" />
          <rect x="56" y="118" width="104" height="18" rx="9" />
        </g>
    </EmptyGraphicSvg>
  );
}
