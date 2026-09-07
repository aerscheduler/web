/** Keep in lockstep with server/src/utils/publicBookingBrand.ts */

const HEX = /^#[0-9A-Fa-f]{6}$/;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

/** WCAG contrast ratio of the hex against white. Buttons sit on a light card. */
export function contrastAgainstWhite(hex: string): number {
  const L = relativeLuminance(hexToRgb(hex));
  return 1.05 / (L + 0.05);
}

export function publicBookingAccentFeedback(value: string): string | null {
  const hex = value.trim();
  if (!hex) return null;
  if (!HEX.test(hex)) return "Accent color must be a hex value like #1967d2.";
  if (contrastAgainstWhite(hex) < 3) {
    return "That accent is too light against a white page. Pick a darker color.";
  }
  return null;
}
