import { EmptyGraphicSvg } from "./graphic-svg";

export function SquawksResolvedEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="71.5 24.5 101 162" className={className}>
      {/* Fleet / Nothing resolved yet. Clipboard with a two-stroke check in the first box. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="48" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="80" y="48" width="84" height="116" rx="8" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="76" y="44" width="84" height="116" rx="8" />
          <path d="M104 44v-12h32v12" />
          <path d="M112 32c0-8 16-8 16 0" />
          <rect x="88" y="66" width="18" height="18" rx="3" />
          <path d="M92 76l5 5 10-12" />
          <path d="M114 75h34" opacity="0.45" strokeWidth="1.7" />
          <rect x="88" y="96" width="18" height="18" rx="3" />
          <path d="M114 105h34" opacity="0.45" strokeWidth="1.7" />
          <rect x="88" y="126" width="18" height="18" rx="3" />
          <path d="M114 135h26" opacity="0.45" strokeWidth="1.7" />
        </g>
    </EmptyGraphicSvg>
  );
}
