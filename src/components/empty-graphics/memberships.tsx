import { EmptyGraphicSvg } from "./graphic-svg";

export function MembershipsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="40 35 156.5 160.5" className={className}>
      {/* Settings: Memberships, "No membership plans yet".
             Membership card with a blank name plate; not a chip-and-terminal card. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="186" rx="58" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="78" y="78" width="118" height="74" rx="10" opacity="0.22" />
          <rect x="72" y="72" width="118" height="74" rx="10" opacity="0.34" />
          <rect x="66" y="66" width="118" height="74" rx="10" opacity="0.5" />
          <rect x="60" y="60" width="118" height="74" rx="10" opacity="0.72" />
          <g transform="rotate(-11 116 90)">
            <rect x="48" y="44" width="118" height="74" rx="10" />
            <path d="M48 62h118" opacity="0.4" strokeWidth="1.7" />
            <circle cx="68" cy="78" r="10" />
            <circle cx="68" cy="78" r="4.5" opacity="0.7" strokeWidth="1.6" />
            <rect x="86" y="70" width="68" height="16" rx="3" />
            <path d="M86 100h68" opacity="0.35" strokeWidth="1.6" />
          </g>
        </g>
    </EmptyGraphicSvg>
  );
}
