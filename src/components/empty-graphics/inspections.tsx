import { EmptyGraphicSvg } from "./graphic-svg";

export function InspectionsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="71.5 24.5 101 162" className={className}>
      {/* Fleet / Inspections. Clipboard with empty boxes. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="48" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="80" y="48" width="84" height="116" rx="8" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="76" y="44" width="84" height="116" rx="8" />
          <path d="M104 44v-12h32v12" />
          <path d="M112 32c0-8 16-8 16 0" />
          <rect x="90" y="68" width="14" height="14" rx="2" />
          <path d="M112 75h36" opacity="0.45" strokeWidth="1.7" />
          <rect x="90" y="96" width="14" height="14" rx="2" />
          <path d="M112 103h36" opacity="0.45" strokeWidth="1.7" />
          <rect x="90" y="124" width="14" height="14" rx="2" />
          <path d="M112 131h28" opacity="0.45" strokeWidth="1.7" />
        </g>
    </EmptyGraphicSvg>
  );
}
