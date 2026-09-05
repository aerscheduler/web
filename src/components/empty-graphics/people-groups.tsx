import { EmptyGraphicSvg } from "./graphic-svg";

export function PeopleGroupsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="62.5 62.5 119 127" className={className}>
      {/* Settings / People groups. Three heads. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <circle cx="86" cy="96" r="16" transform="translate(3.5 4)" opacity="0.28" />
          <circle cx="122" cy="86" r="16" transform="translate(3.5 4)" opacity="0.28" />
          <circle cx="158" cy="96" r="16" transform="translate(3.5 4)" opacity="0.28" />
          <circle cx="82" cy="92" r="16" />
          <circle cx="122" cy="82" r="16" />
          <circle cx="162" cy="92" r="16" />
          <path d="M68 128c2-16 28-16 30 0" />
          <path d="M106 118c2-16 30-16 32 0" />
          <path d="M146 128c2-16 28-16 30 0" />
        </g>
    </EmptyGraphicSvg>
  );
}
