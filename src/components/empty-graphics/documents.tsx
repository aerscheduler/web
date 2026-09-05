import { cn } from "@/lib/utils";

/**
 * Approved empty-state drawing for You · Documents.
 * Tight viewBox is the getBBox of the ink, so the stack sits on the left edge.
 */
export function DocumentsEmptyGraphic({ className }: { className?: string }) {
  return (
    <svg
      viewBox="49.5 7.5 131 180"
      preserveAspectRatio="xMinYMin meet"
      fill="none"
      aria-hidden="true"
      className={cn("h-[108px] w-[79px] text-foreground", className)}
    >
      <g
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <ellipse
          cx="122"
          cy="178"
          rx="58"
          ry="9"
          opacity="0.28"
          strokeDasharray="3.5 4"
        />
        <rect x="92" y="92" width="86" height="70" rx="7" opacity="0.22" />
        <rect x="86" y="86" width="86" height="70" rx="7" opacity="0.34" />
        <rect x="80" y="80" width="86" height="70" rx="7" opacity="0.5" />
        <rect x="74" y="74" width="86" height="70" rx="7" opacity="0.72" />
        <rect x="68" y="68" width="86" height="70" rx="7" />
        <path d="M84 90h38" opacity="0.35" strokeWidth="1.6" />
        <path d="M84 100h28" opacity="0.35" strokeWidth="1.6" />
        <g transform="rotate(-26 108 52)">
          <path
            d="M58 22h62l24 24v48a8 8 0 0 1-8 8H66a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z"
            transform="translate(3.5 4)"
            opacity="0.28"
          />
          <path d="M58 22h62l24 24v48a8 8 0 0 1-8 8H66a8 8 0 0 1-8-8V30a8 8 0 0 1 8-8z" />
          <path d="M120 22v24h24" />
          <path d="M120 46l24-24" opacity="0.45" strokeWidth="1.6" />
          <path d="M74 62h40" opacity="0.5" strokeWidth="1.7" />
          <path d="M74 74h46" opacity="0.5" strokeWidth="1.7" />
          <path d="M74 86h32" opacity="0.5" strokeWidth="1.7" />
          <circle cx="90" cy="108" r="8" opacity="0.7" strokeWidth="1.7" />
          <circle cx="90" cy="108" r="3.2" opacity="0.7" strokeWidth="1.5" />
        </g>
      </g>
    </svg>
  );
}
