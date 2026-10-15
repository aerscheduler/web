import type { ReservationType } from "@/types/api";

/**
 * An organization's own colors for reservation types (Settings, Schedule colors).
 *
 * The board, the legend, the month chips and every type dot read the `--res-*` CSS
 * variables, so an organization's colors are applied by overriding those variables once,
 * at the root, rather than by touching any component. A type the organization left alone
 * keeps the default declared in styles.css.
 *
 * The app reads the same `organization.reservationTypeColors` in `reservationTypeColor()`.
 */
export const COLORABLE_TYPES = ["dual", "solo", "shared", "ground", "sim", "rental", "guest", "maintenance"] as const;
export type ColorableType = (typeof COLORABLE_TYPES)[number];
export type ReservationTypeColors = Partial<Record<ColorableType, string>>;

/** The defaults in styles.css (light), so the picker can show what "Default" means. */
export const DEFAULT_TYPE_HEX: Record<ColorableType, string> = {
  dual: "#B5397E",
  solo: "#1967D2",
  shared: "#17876F",
  ground: "#5B6472",
  sim: "#9A6A45",
  rental: "#17876F",
  guest: "#7256B0",
  maintenance: "#5E7290",
};

/** The CSS variable each type is drawn with. Instructor is an old alias of dual. */
export function typeColorVar(type: ReservationType | ColorableType): string {
  return `--res-${type === "instructor" ? "dual" : type}`;
}

/**
 * A palette that all reads on white (3:1 or better) and stays apart on a dense board.
 * Free choice is there too, through the custom swatch, under the same readability rule.
 */
export const TYPE_COLOR_PRESETS: { name: string; hex: string }[] = [
  { name: "Blue", hex: "#1967D2" },
  { name: "Navy", hex: "#2C4589" },
  { name: "Teal", hex: "#0B7A75" },
  { name: "Green", hex: "#17876F" },
  { name: "Olive", hex: "#5F7A1F" },
  { name: "Amber", hex: "#A35A00" },
  { name: "Brown", hex: "#9A6A45" },
  { name: "Red", hex: "#C5221F" },
  { name: "Rose", hex: "#B5397E" },
  { name: "Purple", hex: "#7256B0" },
  { name: "Slate", hex: "#5E7290" },
  { name: "Graphite", hex: "#5B6472" },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast against a white card, the same rule the server enforces. */
export function readableOnWhite(hex: string): boolean {
  if (!HEX.test(hex)) return false;
  return 1.05 / (luminance(hex) + 0.05) >= 3;
}

/**
 * The stylesheet that applies an organization's colors, or "" when it has none.
 *
 * Dark mode lifts the color toward white, as the default dark hues are lifted, so a navy
 * chosen for the light board does not vanish on the near-black one.
 */
export function typeColorsCss(colors: ReservationTypeColors | null | undefined): string {
  if (!colors) return "";
  const light: string[] = [];
  const dark: string[] = [];
  for (const type of COLORABLE_TYPES) {
    const hex = colors[type];
    if (!hex || !HEX.test(hex)) continue;
    light.push(`${typeColorVar(type)}: ${hex};`);
    dark.push(`${typeColorVar(type)}: color-mix(in oklab, ${hex} 70%, white);`);
  }
  if (!light.length) return "";
  return `:root { ${light.join(" ")} } :root.dark { ${dark.join(" ")} }`;
}
