import { EmptyGraphicSvg } from "./graphic-svg";

export function MyLedgerEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="47.5 29.5 141 160" className={className}>
      {/* You / My ledger, "No ledger entries yet". Open account book, empty balance column. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="118" cy="178" rx="58" ry="9" opacity="0.28" strokeDasharray="3.5 4" />
          <path d="M62 40H110Q120 98 110 148H62A8 8 0 0 1 54 140V48A8 8 0 0 1 62 40Z" transform="translate(3.5 4)" opacity="0.22" />
          <path d="M126 40H174A8 8 0 0 1 182 48V140A8 8 0 0 1 174 148H126Q116 98 126 40Z" transform="translate(3.5 4)" opacity="0.22" />
          <path d="M58 36H106Q116 96 106 152H58A8 8 0 0 1 50 144V44A8 8 0 0 1 58 36Z" opacity="0.5" />
          <path d="M130 36H178A8 8 0 0 1 186 44V144A8 8 0 0 1 178 152H130Q120 96 130 36Z" opacity="0.5" />
          <path d="M62 32H110Q118 92 110 148H62A8 8 0 0 1 54 140V40A8 8 0 0 1 62 32Z" />
          <path d="M126 32H174A8 8 0 0 1 182 40V140A8 8 0 0 1 174 148H126Q118 92 126 32Z" />
          <path d="M118 34V146" opacity="0.55" strokeWidth="1.7" />
          <path d="M70 48h28" opacity="0.45" strokeWidth="1.6" />
          <path d="M70 62h32" opacity="0.4" strokeWidth="1.6" />
          <path d="M70 76h30" opacity="0.4" strokeWidth="1.6" />
          <path d="M70 90h32" opacity="0.4" strokeWidth="1.6" />
          <path d="M70 104h26" opacity="0.4" strokeWidth="1.6" />
          <path d="M70 118h30" opacity="0.4" strokeWidth="1.6" />
          <path d="M70 132h22" opacity="0.35" strokeWidth="1.5" />
          <path d="M136 48h22" opacity="0.45" strokeWidth="1.6" />
          <path d="M136 62h20" opacity="0.4" strokeWidth="1.6" />
          <path d="M136 76h22" opacity="0.4" strokeWidth="1.6" />
          <path d="M136 90h18" opacity="0.4" strokeWidth="1.6" />
          <path d="M136 104h20" opacity="0.4" strokeWidth="1.6" />
          <path d="M136 118h16" opacity="0.35" strokeWidth="1.5" />
          <path d="M164 44V140" opacity="0.75" strokeWidth="1.7" />
        </g>
    </EmptyGraphicSvg>
  );
}
