import { EmptyGraphicSvg } from "./graphic-svg";

export function RatingsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="53.5 35.5 140 159.5" className={className}>
      {/* Settings: Ratings, "No ratings yet".
             Landscape certificate with a ribbon seal; not a dog-eared sheet. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="120" cy="186" rx="58" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="rotate(8 120 88) translate(3.5 4)" opacity="0.28">
            <rect x="56" y="40" width="128" height="88" rx="7" />
          </g>
          <g transform="rotate(8 120 88)">
            <rect x="60" y="44" width="120" height="82" rx="6" transform="translate(4 5)" opacity="0.34" />
            <rect x="60" y="44" width="120" height="82" rx="6" />
            <rect x="70" y="54" width="100" height="62" rx="3" opacity="0.5" strokeWidth="1.7" />
            <path d="M92 68h56" opacity="0.5" strokeWidth="1.7" />
            <path d="M100 80h40" opacity="0.45" strokeWidth="1.6" />
            <path d="M96 90h48" opacity="0.45" strokeWidth="1.6" />
            <path d="M66 50h8M66 50v8" opacity="0.45" strokeWidth="1.6" />
            <path d="M174 50h-8M174 50v8" opacity="0.45" strokeWidth="1.6" />
            <path d="M66 120h8M66 120v-8" opacity="0.45" strokeWidth="1.6" />
            <path d="M174 120h-8M174 120v-8" opacity="0.45" strokeWidth="1.6" />
          </g>
          <circle cx="120" cy="130" r="13" />
          <circle cx="120" cy="130" r="6.5" opacity="0.75" strokeWidth="1.7" />
          <path d="M113 141 101 174l10-5 4 13 7-38" />
          <path d="M127 141 139 174l-10-5-4 13-7-38" />
        </g>
    </EmptyGraphicSvg>
  );
}
