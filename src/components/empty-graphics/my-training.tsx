import { EmptyGraphicSvg } from "./graphic-svg";

export function MyTrainingEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="61.5 25.5 123 164" className={className}>
      {/* You / My training, "You're not on a course". Closed syllabus binder, unlabeled spine. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="120" cy="178" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <rect x="92" y="42" width="90" height="124" rx="7" opacity="0.22" />
          <rect x="86" y="36" width="90" height="124" rx="7" opacity="0.4" />
          <path d="M84 28H168A8 8 0 0 1 176 36V144A8 8 0 0 1 168 152H84V28Z" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M72 28H84V152H72A8 8 0 0 1 64 144V36A8 8 0 0 1 72 28Z" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M84 28H168A8 8 0 0 1 176 36V144A8 8 0 0 1 168 152H84Z" />
          <path d="M72 28H84V152H72A8 8 0 0 1 64 144V36A8 8 0 0 1 72 28Z" />
          <rect x="68" y="62" width="12" height="56" rx="2.5" opacity="0.5" strokeWidth="1.6" />
          <circle cx="74" cy="48" r="5" strokeWidth="1.7" />
          <circle cx="74" cy="90" r="5" strokeWidth="1.7" />
          <circle cx="74" cy="132" r="5" strokeWidth="1.7" />
          <path d="M84 48h8" opacity="0.7" strokeWidth="1.6" />
          <path d="M84 90h8" opacity="0.7" strokeWidth="1.6" />
          <path d="M84 132h8" opacity="0.7" strokeWidth="1.6" />
          <path d="M74 53v73" opacity="0.35" strokeWidth="1.5" />
          <rect x="100" y="48" width="56" height="28" rx="4" opacity="0.6" strokeWidth="1.7" />
          <path d="M100 96h50" opacity="0.4" strokeWidth="1.6" />
          <path d="M100 108h42" opacity="0.4" strokeWidth="1.6" />
          <path d="M100 120h46" opacity="0.4" strokeWidth="1.6" />
          <path d="M100 132h30" opacity="0.32" strokeWidth="1.5" />
        </g>
    </EmptyGraphicSvg>
  );
}
