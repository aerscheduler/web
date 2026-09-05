import { EmptyGraphicSvg } from "./graphic-svg";

export function SimulatorsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="64.5 30.5 109 159" className={className}>
      {/* Joystick. One control, not a screen that turns into a face. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="48" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <circle cx="130" cy="56" r="18" />
            <path d="M126 74L112 128" />
            <ellipse cx="108" cy="148" rx="36" ry="12" />
          </g>
          <circle cx="126" cy="52" r="18" />
          <path d="M122 70L108 124" />
          <ellipse cx="104" cy="144" rx="36" ry="12" />
        </g>
    </EmptyGraphicSvg>
  );
}
