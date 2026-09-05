import { EmptyGraphicSvg } from "./graphic-svg";

export function PeopleRolesEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="55.5 53.5 140.5 110" className={className}>
      {/* People / Roles, "Everyone has a role". Badge rack, every hook occupied. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="154" rx="64" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <path d="M56 58H188" />
            <path d="M74 58v14q0 7 7 7" />
            <path d="M108 58v14q0 7 7 7" />
            <path d="M142 58v14q0 7 7 7" />
            <path d="M176 58v14q0 7 7 7" />
            <rect x="62" y="80" width="28" height="40" rx="4" />
            <rect x="96" y="80" width="28" height="40" rx="4" />
            <rect x="130" y="80" width="28" height="40" rx="4" />
            <rect x="164" y="80" width="28" height="40" rx="4" />
          </g>
          <path d="M56 54v8" />
          <path d="M188 54v8" />
          <path d="M56 58H188" />
          <path d="M74 58v14q0 7 7 7" />
          <path d="M108 58v14q0 7 7 7" />
          <path d="M142 58v14q0 7 7 7" />
          <path d="M176 58v14q0 7 7 7" />
          <g transform="rotate(-6 76 100)">
            <rect x="62" y="80" width="28" height="40" rx="4" />
            <circle cx="76" cy="88" r="2.3" opacity="0.7" strokeWidth="1.5" />
            <circle cx="76" cy="100" r="5" opacity="0.5" strokeWidth="1.6" />
            <path d="M68 111h16" opacity="0.45" strokeWidth="1.6" />
          </g>
          <g transform="rotate(4 110 100)">
            <rect x="96" y="80" width="28" height="40" rx="4" />
            <circle cx="110" cy="88" r="2.3" opacity="0.7" strokeWidth="1.5" />
            <circle cx="110" cy="100" r="5" opacity="0.5" strokeWidth="1.6" />
            <path d="M102 111h16" opacity="0.45" strokeWidth="1.6" />
          </g>
          <g transform="rotate(-5 144 100)">
            <rect x="130" y="80" width="28" height="40" rx="4" />
            <circle cx="144" cy="88" r="2.3" opacity="0.7" strokeWidth="1.5" />
            <circle cx="144" cy="100" r="5" opacity="0.5" strokeWidth="1.6" />
            <path d="M136 111h16" opacity="0.45" strokeWidth="1.6" />
          </g>
          <g transform="rotate(3 178 100)">
            <rect x="164" y="80" width="28" height="40" rx="4" />
            <circle cx="178" cy="88" r="2.3" opacity="0.7" strokeWidth="1.5" />
            <circle cx="178" cy="100" r="5" opacity="0.5" strokeWidth="1.6" />
            <path d="M170 111h16" opacity="0.45" strokeWidth="1.6" />
          </g>
        </g>
    </EmptyGraphicSvg>
  );
}
