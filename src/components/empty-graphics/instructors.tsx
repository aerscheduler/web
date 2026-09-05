import { EmptyGraphicSvg } from "./graphic-svg";

export function InstructorsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="41.5 48.5 161 138" className={className}>
      {/* Aviation headset, large cups, obvious boom mic. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <path d="M64 108a58 58 0 0 1 116 0" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M60 104a58 58 0 0 1 116 0" />
          <rect x="48" y="100" width="28" height="44" rx="10" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="160" y="100" width="28" height="44" rx="10" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="44" y="96" width="28" height="44" rx="10" />
          <rect x="156" y="96" width="28" height="44" rx="10" />
          <path d="M44 128 Q28 148 36 168" />
          <ellipse cx="38" cy="174" rx="10" ry="6" />
        </g>
    </EmptyGraphicSvg>
  );
}
