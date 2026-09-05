import { EmptyGraphicSvg } from "./graphic-svg";

export function PaymentsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="49.5 14 135.5 175.5" className={className}>
      {/* You / Payments, "Online payments aren't set up". Chip card, disconnected terminal plug. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="116" cy="178" rx="56" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="rotate(-12 118 58)">
            <rect x="74" y="32" width="100" height="62" rx="9" transform="translate(3.5 4)" opacity="0.22" />
            <rect x="70" y="28" width="100" height="62" rx="9" opacity="0.4" />
            <rect x="66" y="24" width="100" height="62" rx="9" />
            <rect x="78" y="36" width="18" height="14" rx="2.5" opacity="0.75" strokeWidth="1.7" />
            <path d="M81 40h12M81 45h12" opacity="0.55" strokeWidth="1.5" />
            <path d="M66 58h100" opacity="0.45" strokeWidth="1.7" />
            <path d="M78 70h12M96 70h12M114 70h12M132 70h10" opacity="0.4" strokeWidth="1.6" />
          </g>
          <rect x="108" y="104" width="52" height="38" rx="7" transform="translate(3.5 4)" opacity="0.28" />
          <rect x="108" y="104" width="52" height="38" rx="7" />
          <rect x="116" y="112" width="36" height="14" rx="2.5" opacity="0.55" strokeWidth="1.6" />
          <path d="M118 134h32" opacity="0.7" strokeWidth="1.7" />
          <path d="M108 128H106" opacity="0.8" />
          <rect x="88" y="122" width="18" height="14" rx="3" />
          <path d="M88 126h-10M88 132h-10" />
          <rect x="52" y="120" width="18" height="18" rx="4" opacity="0.85" />
          <path d="M58 125v3.5M58 133v3.5" opacity="0.7" strokeWidth="1.6" />
        </g>
    </EmptyGraphicSvg>
  );
}
