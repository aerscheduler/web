import { EmptyGraphicSvg } from "./graphic-svg";

export function ReportSchedulesEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="40.5 31 141 157.5" className={className}>
      {/* Wall clock beside a stacked report that has no checkmarks. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="116" cy="178" rx="58" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <circle cx="78" cy="84" r="36" transform="translate(3.5 4)" opacity="0.28" />
          <circle cx="78" cy="84" r="36" />
          <path d="M78 48v-8" />
          <circle cx="78" cy="36" r="4" strokeWidth="1.7" />
          <path d="M78 56v10" opacity="0.7" strokeWidth="1.7" />
          <path d="M78 102v10" opacity="0.7" strokeWidth="1.7" />
          <path d="M50 84h10" opacity="0.7" strokeWidth="1.7" />
          <path d="M96 84h10" opacity="0.7" strokeWidth="1.7" />
          <path d="M78 84V62" />
          <path d="M78 84l16 10" />
          <circle cx="78" cy="84" r="3.2" strokeWidth="1.6" />
          <rect x="126" y="64" width="54" height="78" rx="6" opacity="0.22" />
          <rect x="120" y="68" width="54" height="78" rx="6" opacity="0.34" />
          <rect x="114" y="72" width="54" height="78" rx="6" opacity="0.5" />
          <rect x="108" y="76" width="54" height="78" rx="6" />
          <circle cx="122" cy="96" r="5.5" opacity="0.7" strokeWidth="1.7" />
          <path d="M132 96h18" opacity="0.45" strokeWidth="1.6" />
          <circle cx="122" cy="114" r="5.5" opacity="0.7" strokeWidth="1.7" />
          <path d="M132 114h22" opacity="0.45" strokeWidth="1.6" />
          <circle cx="122" cy="132" r="5.5" opacity="0.7" strokeWidth="1.7" />
          <path d="M132 132h14" opacity="0.45" strokeWidth="1.6" />
        </g>
    </EmptyGraphicSvg>
  );
}
