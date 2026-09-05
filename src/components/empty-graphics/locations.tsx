import { EmptyGraphicSvg } from "./graphic-svg";

export function LocationsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="79.5 38.5 85 148" className={className}>
      {/* Fleet / Locations. Map pin. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="40" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <path d="M122 46c-22 0-40 17-40 38 0 28 40 72 40 72s40-44 40-72c0-21-18-38-40-38z" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M122 42c-22 0-40 17-40 38 0 28 40 72 40 72s40-44 40-72c0-21-18-38-40-38z" />
          <circle cx="122" cy="78" r="14" />
        </g>
    </EmptyGraphicSvg>
  );
}
