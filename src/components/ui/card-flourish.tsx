/**
 * The soft angled wash that sits behind a promotional card.
 *
 * Stripe puts one of these behind its "Recommendation" card, and the reason it
 * works there is worth stating, because it is the reason it is used sparingly
 * here: the shape marks a card as an ASIDE. Everything else on the dashboard is
 * a figure the school is meant to read; these cards are the product talking to
 * them. The wash says so before the copy does.
 *
 * So it goes on the promotional and empty-state cards, and NOT on a card
 * carrying a number. A tinted panel behind a figure is a panel that changes the
 * figure's contrast for no reason the reader can act on, and once every card has
 * one none of them mean anything.
 *
 * Built from gradients rather than an asset: it has to survive both themes and
 * any card size, and a raster would need two files and would still band on a
 * wide card. `--primary` at single-digit percentages reads as a tint of the
 * brand in light mode and as a lift off the surface in dark, without either one
 * needing its own rule.
 */

import { cn } from "@/lib/utils";

export function CardFlourish({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      // `inset-0` inside a card that clips: the shapes run off the edges on
      // purpose, which is what makes them read as a crop of something larger
      // rather than as a blob placed in the corner.
      // `-z-10` with `isolate` on the card: negative z puts this under the
      // card's in-flow content, and the isolate keeps "under" meaning under the
      // CONTENT rather than under the card's own background, where it would be
      // invisible. Both halves are required; neither works alone.
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      <svg
        className="absolute inset-0 size-full"
        // The shapes are proportional to the card, not a fixed size, so one
        // definition covers a full-width checklist and a narrow empty state.
        viewBox="0 0 400 200"
        preserveAspectRatio="none"
        focusable="false"
      >
        <defs>
          <linearGradient id="cf-a" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.10" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="cf-b" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.07" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Two overlapping wedges sweeping off the top-right corner. The
            asymmetry is the point: a symmetrical shape reads as a border. */}
        <polygon points="180,200 400,40 400,200" fill="url(#cf-a)" />
        <polygon points="260,0 400,0 400,120" fill="url(#cf-b)" />
      </svg>
    </div>
  );
}
