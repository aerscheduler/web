import { EmptyGraphicSvg } from "./graphic-svg";

export function AnnouncementsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="50.5 50.5 152 139" className={className}>
      {/* Megaphone with a round mouth and sound waves. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <path d="M58 96h18l52-32v88L76 120H58z" />
            <ellipse cx="132" cy="110" rx="10" ry="40" />
          </g>
          <path d="M54 92h18l52-32v88L72 116H54z" />
          <ellipse cx="128" cy="106" rx="10" ry="40" />
          <path d="M72 116l-10 36h22" />
          <path d="M150 78c14 10 14 46 0 56" opacity="0.55" strokeWidth="1.8" />
          <path d="M164 66c22 16 22 64 0 80" opacity="0.4" strokeWidth="1.7" />
          <path d="M176 54c30 22 30 82 0 104" opacity="0.28" strokeWidth="1.6" />
        </g>
    </EmptyGraphicSvg>
  );
}
