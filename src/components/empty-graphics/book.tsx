import { EmptyGraphicSvg } from "./graphic-svg";

export function BookEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="61.5 12.5 123 177" className={className}>
      {/* You / Book, "Nothing to book yet". Resource board, dashed empty slot. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="120" cy="178" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="70" y="36" width="112" height="126" rx="8" opacity="0.28" />
          <rect x="64" y="30" width="112" height="126" rx="8" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="64" y="30" width="112" height="126" rx="8" />
          <circle cx="100" cy="22" r="7" />
          <circle cx="140" cy="22" r="7" />
          <path d="M100 29V30M140 29V30" opacity="0.7" strokeWidth="1.6" />
          <path d="M76 48h88" opacity="0.5" strokeWidth="1.7" />
          <rect x="76" y="60" width="18" height="14" rx="3" opacity="0.7" strokeWidth="1.7" />
          <rect x="76" y="92" width="18" height="14" rx="3" opacity="0.55" strokeWidth="1.6" />
          <rect x="76" y="124" width="18" height="14" rx="3" opacity="0.4" strokeWidth="1.6" />
          <path d="M85 60v-6" opacity="0.55" strokeWidth="1.5" />
          <path d="M85 92v-6" opacity="0.4" strokeWidth="1.5" />
          <path d="M85 124v-6" opacity="0.35" strokeWidth="1.5" />
          <path d="M128 52v92M154 52v92" opacity="0.22" strokeWidth="1.5" />
          <rect x="102" y="56" width="62" height="28" rx="5" strokeDasharray="5 4" />
          <rect x="102" y="94" width="44" height="16" rx="3" opacity="0.35" strokeWidth="1.6" />
          <rect x="102" y="122" width="36" height="16" rx="3" opacity="0.28" strokeWidth="1.5" />
          <path d="M80 156v10M160 156v10" opacity="0.55" strokeWidth="1.7" />
        </g>
    </EmptyGraphicSvg>
  );
}
