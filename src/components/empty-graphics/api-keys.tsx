import { EmptyGraphicSvg } from "./graphic-svg";

export function ApiKeysEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="48.5 44.5 147 145" className={className}>
      {/* Code brackets: </> */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="58" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <path d="M96 56L56 110 96 164" />
            <path d="M148 56L188 110 148 164" />
            <path d="M136 52L108 168" />
          </g>
          <path d="M92 52L52 106 92 160" />
          <path d="M152 52L192 106 152 160" />
          <path d="M132 48L104 164" />
        </g>
    </EmptyGraphicSvg>
  );
}
