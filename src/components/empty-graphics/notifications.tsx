import { EmptyGraphicSvg } from "./graphic-svg";

export function NotificationsEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="62.5 30.5 119 159" className={className}>
      {/* Notification bell: round top, straight sides, small brim, clapper on the lip. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="48" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <g transform="translate(3.5 4)" opacity="0.28">
            <path d="M86 122V96c0-24 14-44 36-44s36 20 36 44v26h16v12H70v-12z" />
          </g>
          <path d="M114 40c0-8 16-8 16 0" />
          <path d="M82 118V92c0-24 14-44 36-44s36 20 36 44v26h16v12H66v-12z" />
          <path d="M108 130c4 14 24 14 28 0" />
        </g>
    </EmptyGraphicSvg>
  );
}
