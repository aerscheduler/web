import { EmptyGraphicSvg } from "./graphic-svg";

export function InTrainingEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="50.5 52.5 143 137" className={className}>
      {/* Open book. In training, not another file stack. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <path d="M122 60 L58 72v92l64-10z" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M122 60 L186 72v92l-64-10z" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M122 56 L54 68v92l68-10z" />
          <path d="M122 56 L190 68v92l-68-10z" />
          <path d="M122 56v92" />
          <path d="M70 88h36" opacity="0.4" strokeWidth="1.6" />
          <path d="M70 104h32" opacity="0.4" strokeWidth="1.6" />
          <path d="M138 88h36" opacity="0.4" strokeWidth="1.6" />
          <path d="M138 104h32" opacity="0.4" strokeWidth="1.6" />
        </g>
    </EmptyGraphicSvg>
  );
}
