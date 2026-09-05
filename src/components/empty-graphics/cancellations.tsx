import { EmptyGraphicSvg } from "./graphic-svg";

export function CancellationsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="64.5 30.5 115 158" className={className}>
      {/* Tear-off calendar page with a dashed unfilled date range. Not a Lucide calendar. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="74" y="32" width="96" height="20" rx="5" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="66" y="50" width="108" height="112" rx="8" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="74" y="32" width="96" height="20" rx="5" />
          <path d="M96 32v20" opacity="0.7" strokeWidth="1.7" />
          <path d="M148 32v20" opacity="0.7" strokeWidth="1.7" />
          <path d="M80 50h88" opacity="0.7" strokeWidth="1.7" strokeDasharray="2.4 3.2" />
          <rect x="66" y="50" width="108" height="112" rx="8" />
          <path d="M66 72h108" />
          <path d="M82 62h76" opacity="0.4" strokeWidth="1.6" />
          <path d="M78 88h84" opacity="0.38" strokeWidth="1.6" />
          <path d="M78 106h84" opacity="0.38" strokeWidth="1.6" />
          <path d="M78 124h84" opacity="0.38" strokeWidth="1.6" />
          <path d="M78 142h84" opacity="0.38" strokeWidth="1.6" />
          <path d="M90 80v70" opacity="0.28" strokeWidth="1.5" />
          <path d="M110 80v70" opacity="0.28" strokeWidth="1.5" />
          <path d="M130 80v70" opacity="0.28" strokeWidth="1.5" />
          <path d="M150 80v70" opacity="0.28" strokeWidth="1.5" />
          <rect x="96" y="96" width="48" height="40" rx="5" strokeDasharray="3.5 4" />
        </g>
    </EmptyGraphicSvg>
  );
}
