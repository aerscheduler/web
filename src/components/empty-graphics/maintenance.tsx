import { EmptyGraphicSvg } from "./graphic-svg";

export function MaintenanceEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="51.5 33.5 145 157" className={className}>
      {/* Fleet / maintenance, "Nothing being tracked yet". Analog tach, blank face, needle at rest. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="54" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <rect x="54" y="36" width="136" height="128" rx="10" />
            <circle cx="122" cy="100" r="52" />
          </g>
          <rect x="54" y="36" width="136" height="128" rx="10" />
          <circle cx="122" cy="100" r="52" />
          <circle cx="122" cy="100" r="44" opacity="0.72" />
          <path d="M122 62 v9" />
          <path d="M122 129 v9" />
          <path d="M82 100 h9" />
          <path d="M153 100 h9" />
          <path d="M93 73 l6 6" opacity="0.5" strokeWidth="1.6" />
          <path d="M145 73 l-6 6" opacity="0.5" strokeWidth="1.6" />
          <path d="M93 127 l6 -6" opacity="0.5" strokeWidth="1.6" />
          <path d="M145 127 l-6 -6" opacity="0.5" strokeWidth="1.6" />
          <rect x="104" y="76" width="36" height="16" rx="2" />
          <path d="M113 76 v16" opacity="0.4" strokeWidth="1.6" />
          <path d="M122 76 v16" opacity="0.4" strokeWidth="1.6" />
          <path d="M131 76 v16" opacity="0.4" strokeWidth="1.6" />
          <path d="M122 100 L104 140" />
          <circle cx="122" cy="100" r="5" />
          <path d="M64 46 h6 M67 43 v6" opacity="0.55" strokeWidth="1.6" />
          <path d="M174 46 h6 M177 43 v6" opacity="0.55" strokeWidth="1.6" />
          <path d="M64 152 h6 M67 149 v6" opacity="0.55" strokeWidth="1.6" />
          <path d="M174 152 h6 M177 149 v6" opacity="0.55" strokeWidth="1.6" />
        </g>
    </EmptyGraphicSvg>
  );
}
