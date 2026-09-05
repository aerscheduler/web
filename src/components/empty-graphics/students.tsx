import { EmptyGraphicSvg } from "./graphic-svg";

export function StudentsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="54.5 40.5 139 149" className={className}>
      {/* Graduation cap. Mortarboard, tassel, shallow bowl. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="56" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <path d="M122 48L186 78 122 108 58 78z" />
            <path d="M78 92c8 22 80 22 88 0" />
          </g>
          <path d="M122 44L186 74 122 104 58 74z" />
          <circle cx="122" cy="74" r="4" />
          <path d="M122 74c22 8 28 28 30 52" />
          <circle cx="152" cy="130" r="5" />
          <path d="M74 88c8 22 88 22 96 0" />
        </g>
    </EmptyGraphicSvg>
  );
}
