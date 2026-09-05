import { EmptyGraphicSvg } from "./graphic-svg";

export function SquawksOpenEmptyGraphic({ className }: { className?: string }) {
  return (
    <EmptyGraphicSvg viewBox="73.2 59.2 101 130" className={className}>
      {/* One cog. Maintenance. */}
        <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <ellipse cx="122" cy="178" rx="44" ry="8" opacity="0.28" strokeDasharray="3.5 4" />
          <path d="M109.8 78.4L116.5 76.5L114.1 62.7L129.9 62.7L127.5 76.5L134.2 78.4L140.4 81.8L148.5 70.4L159.6 81.5L148.2 89.6L151.6 95.8L153.5 102.5L167.3 100.1L167.3 115.9L153.5 113.5L151.6 120.2L148.2 126.4L159.6 134.5L148.5 145.6L140.4 134.2L134.2 137.6L127.5 139.5L129.9 153.3L114.1 153.3L116.5 139.5L109.8 137.6L103.6 134.2L95.5 145.6L84.4 134.5L95.8 126.4L92.4 120.2L90.5 113.5L76.7 115.9L76.7 100.1L90.5 102.5L92.4 95.8L95.8 89.6L84.4 81.5L95.5 70.4L103.6 81.8Z" transform="translate(3.5 4)" opacity="0.28" />
          <path d="M109.8 78.4L116.5 76.5L114.1 62.7L129.9 62.7L127.5 76.5L134.2 78.4L140.4 81.8L148.5 70.4L159.6 81.5L148.2 89.6L151.6 95.8L153.5 102.5L167.3 100.1L167.3 115.9L153.5 113.5L151.6 120.2L148.2 126.4L159.6 134.5L148.5 145.6L140.4 134.2L134.2 137.6L127.5 139.5L129.9 153.3L114.1 153.3L116.5 139.5L109.8 137.6L103.6 134.2L95.5 145.6L84.4 134.5L95.8 126.4L92.4 120.2L90.5 113.5L76.7 115.9L76.7 100.1L90.5 102.5L92.4 95.8L95.8 89.6L84.4 81.5L95.5 70.4L103.6 81.8Z" />
          <circle cx="122" cy="108" r="14" />
        </g>
    </EmptyGraphicSvg>
  );
}
