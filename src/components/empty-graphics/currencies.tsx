import { EmptyGraphicSvg } from "./graphic-svg";

export function CurrenciesEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="44.5 62.5 155 124" className={className}>
      {/* Landscape ID / medical card. Portrait read as a phone. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="58" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="52" y="74" width="140" height="88" rx="10" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="48" y="70" width="140" height="88" rx="10" />
          <circle cx="80" cy="108" r="18" />
          <path d="M110 92h62" opacity="0.5" strokeWidth="1.7" />
          <path d="M110 108h48" opacity="0.5" strokeWidth="1.7" />
          <rect x="110" y="126" width="56" height="16" rx="3" />
          <path d="M118 134h32" opacity="0.75" strokeWidth="1.7" />
        </g>
    </EmptyGraphicSvg>
  );
}
