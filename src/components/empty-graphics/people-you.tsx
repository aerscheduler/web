import { EmptyGraphicSvg } from "./graphic-svg";

export function PeopleYouEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="62.5 40.5 119 149" className={className}>
      {/* Just you: one person, head and shoulders. Same language as people-groups. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <circle cx="122" cy="76" r="28" />
            <path d="M78 168v-16c0-26 20-42 44-42s44 16 44 42v16" />
          </g>
          <circle cx="122" cy="72" r="28" />
          <path d="M74 164v-16c0-26 20-42 44-42s44 16 44 42v16" />
        </g>
    </EmptyGraphicSvg>
  );
}
