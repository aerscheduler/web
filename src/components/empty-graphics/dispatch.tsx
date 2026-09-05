import { EmptyGraphicSvg } from "./graphic-svg";

export function DispatchEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="64.5 28.5 115 160" className={className}>
      {/* Empty flight-strip board, rails with no strips. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="72" y="30" width="96" height="122" rx="8" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="72" y="30" width="96" height="122" rx="8" />
          <path d="M72 50h96" />
          <path d="M88 40h64" opacity="0.4" strokeWidth="1.6" />
          <path d="M84 66h72" />
          <path d="M84 70h72" opacity="0.4" strokeWidth="1.6" />
          <path d="M84 64v8" />
          <path d="M156 64v8" />
          <path d="M84 90h72" />
          <path d="M84 94h72" opacity="0.4" strokeWidth="1.6" />
          <path d="M84 88v8" />
          <path d="M156 88v8" />
          <path d="M84 114h72" />
          <path d="M84 118h72" opacity="0.4" strokeWidth="1.6" />
          <path d="M84 112v8" />
          <path d="M156 112v8" />
          <path d="M84 138h72" />
          <path d="M84 142h72" opacity="0.4" strokeWidth="1.6" />
          <path d="M84 136v8" />
          <path d="M156 136v8" />
          <path d="M92 152v16" />
          <path d="M148 152v16" />
          <path d="M82 168h24" />
          <path d="M134 168h24" />
        </g>
    </EmptyGraphicSvg>
  );
}
