import { EmptyGraphicSvg } from "./graphic-svg";

export function RoomsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="52.5 32.5 139 154" className={className}>
      {/* Easel chalkboard: A-frame legs so it cannot read as a laptop. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="70" y="42" width="104" height="72" rx="3" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="66" y="38" width="104" height="72" rx="3" />
          <rect x="76" y="48" width="84" height="52" rx="2" />
          <path d="M86 62h64" opacity="0.4" strokeWidth="1.6" />
          <path d="M86 76h48" opacity="0.4" strokeWidth="1.6" />
          <rect x="58" y="110" width="120" height="12" rx="2" />
          <path d="M78 122 L60 172" />
          <path d="M166 122 L184 172" />
          <path d="M88 122 L122 168" />
          <rect x="70" y="108" width="18" height="8" rx="1.5" />
        </g>
    </EmptyGraphicSvg>
  );
}
