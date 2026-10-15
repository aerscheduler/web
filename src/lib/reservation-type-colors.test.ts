import { describe, expect, it } from "vitest";
import { readableOnWhite, typeColorsCss, typeColorVar, TYPE_COLOR_PRESETS } from "./reservation-type-colors";

describe("typeColorsCss", () => {
  it("is empty without colors, so the defaults in styles.css stand", () => {
    expect(typeColorsCss(null)).toBe("");
    expect(typeColorsCss({})).toBe("");
  });

  it("overrides only the types that were set, lifting them for dark mode", () => {
    const css = typeColorsCss({ ground: "#2D8CFF" });
    expect(css).toContain(":root { --res-ground: #2D8CFF; }");
    expect(css).toContain(":root.dark { --res-ground: color-mix(in oklab, #2D8CFF 70%, white); }");
    expect(css).not.toContain("--res-solo");
  });

  it("ignores anything that is not a hex color", () => {
    expect(typeColorsCss({ ground: "red; } body { display:none" })).toBe("");
  });
});

describe("typeColorVar", () => {
  it("draws instructor with dual's variable", () => {
    expect(typeColorVar("instructor")).toBe("--res-dual");
    expect(typeColorVar("shared")).toBe("--res-shared");
  });
});

describe("readableOnWhite", () => {
  it("accepts every preset and refuses a pale color", () => {
    for (const p of TYPE_COLOR_PRESETS) expect(readableOnWhite(p.hex), p.name).toBe(true);
    expect(readableOnWhite("#FFF59D")).toBe(false);
    expect(readableOnWhite("nope")).toBe(false);
  });
});
