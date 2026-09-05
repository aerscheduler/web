import { EmptyGraphicSvg } from "./graphic-svg";

export function MyScheduleEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="63.5 11.5 117 178" className={className}>
      {/* You / My schedule, "No flights on your schedule". Day planner, empty morning block. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="80" y="42" width="96" height="122" rx="8" opacity="0.22" />
          <rect x="74" y="36" width="96" height="122" rx="8" opacity="0.4" />
          <rect x="68" y="30" width="96" height="122" rx="8" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="68" y="30" width="96" height="122" rx="8" />
          <circle cx="88" cy="22" r="8" opacity="0.9" />
          <circle cx="116" cy="22" r="8" opacity="0.9" />
          <circle cx="144" cy="22" r="8" opacity="0.9" />
          <path d="M80 54h72" opacity="0.5" strokeWidth="1.7" />
          <circle cx="90" cy="42" r="7" opacity="0.7" strokeWidth="1.7" />
          <path d="M104 42h14" opacity="0.45" strokeWidth="1.6" />
          <path d="M122 42h10" opacity="0.35" strokeWidth="1.5" />
          <path d="M84 62v80" opacity="0.4" strokeWidth="1.6" />
          <path d="M80 70h8M80 92h8M80 114h8M80 136h8" opacity="0.4" strokeWidth="1.5" />
          <rect x="96" y="62" width="56" height="30" rx="4" strokeDasharray="4 3.5" />
          <path d="M96 104h48" opacity="0.38" strokeWidth="1.6" />
          <path d="M96 116h40" opacity="0.38" strokeWidth="1.6" />
          <path d="M96 128h44" opacity="0.38" strokeWidth="1.6" />
          <path d="M96 140h28" opacity="0.3" strokeWidth="1.5" />
        </g>
    </EmptyGraphicSvg>
  );
}
