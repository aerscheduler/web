import { EmptyGraphicSvg } from "./graphic-svg";

export function AircraftEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="54.6 36.5 138 153" className={className}>
      {/* Three-blade propeller. Not a plane, not a hangar. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="48" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <ellipse cx="122" cy="72" rx="10" ry="32" />
            <ellipse cx="122" cy="72" rx="10" ry="32" transform="rotate(120 122 108)" />
            <ellipse cx="122" cy="72" rx="10" ry="32" transform="rotate(240 122 108)" />
            <circle cx="122" cy="108" r="18" />
          </g>
          <ellipse cx="122" cy="72" rx="10" ry="32" />
          <ellipse cx="122" cy="72" rx="10" ry="32" transform="rotate(120 122 108)" />
          <ellipse cx="122" cy="72" rx="10" ry="32" transform="rotate(240 122 108)" />
          <circle cx="122" cy="108" r="18" />
          <circle cx="122" cy="108" r="7" />
        </g>
    </EmptyGraphicSvg>
  );
}
