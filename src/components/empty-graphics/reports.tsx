import { EmptyGraphicSvg } from "./graphic-svg";

export function ReportsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="64.5 19.5 115 169" className={className}>
      {/* Empty chart frame with axes only, no bars. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <circle cx="122" cy="26" r="5" />
          <path d="M122 31l-18 18" />
          <path d="M122 31l18 18" />
          <rect x="66" y="48" width="108" height="92" rx="7" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="66" y="48" width="108" height="92" rx="7" />
          <rect x="76" y="58" width="88" height="72" rx="3" opacity="0.55" strokeWidth="1.7" />
          <path d="M90 118V70" />
          <path d="M90 118h62" />
          <path d="M90 82h-5" opacity="0.65" strokeWidth="1.6" />
          <path d="M90 94h-5" opacity="0.65" strokeWidth="1.6" />
          <path d="M90 106h-5" opacity="0.65" strokeWidth="1.6" />
          <path d="M108 118v5" opacity="0.65" strokeWidth="1.6" />
          <path d="M126 118v5" opacity="0.65" strokeWidth="1.6" />
          <path d="M144 118v5" opacity="0.65" strokeWidth="1.6" />
          <path d="M90 94h62" opacity="0.22" strokeWidth="1.5" strokeDasharray="3.5 4" />
          <path d="M90 82h62" opacity="0.18" strokeWidth="1.5" strokeDasharray="3.5 4" />
        </g>
    </EmptyGraphicSvg>
  );
}
