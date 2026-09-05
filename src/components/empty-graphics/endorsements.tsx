import { EmptyGraphicSvg } from "./graphic-svg";

export function EndorsementsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="74.5 50.5 95 139" className={className}>
      {/* Prize medal. Endorsement as an award, not a stamp handle. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="44" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <circle cx="122" cy="92" r="34" />
            <path d="M104 120l-12 36 18-10 12 18 12-18 18 10-12-36" />
          </g>
          <circle cx="122" cy="88" r="34" />
          <circle cx="122" cy="88" r="20" />
          <path d="M112 90l8 8 14-16" />
          <path d="M100 116l-12 36 18-10 16 18 16-18 18 10-12-36" />
        </g>
    </EmptyGraphicSvg>
  );
}
