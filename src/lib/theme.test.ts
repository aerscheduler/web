// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTheme,
  getTheme,
  initTheme,
  resolveTheme,
  subscribeToSystemTheme,
} from "./theme";

let systemIsDark = false;
let systemChange: (() => void) | undefined;

beforeEach(() => {
  systemIsDark = false;
  systemChange = undefined;
  localStorage.clear();
  document.documentElement.className = "";
  document.documentElement.style.colorScheme = "";

  const mediaQuery = {
    get matches() {
      return systemIsDark;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: () => void) => {
      systemChange = listener;
    }),
    removeEventListener: vi.fn((_type: string, listener: () => void) => {
      if (systemChange === listener) systemChange = undefined;
    }),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;

  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
});

describe("theme preference", () => {
  it("defaults to system and restores every supported preference", () => {
    expect(getTheme()).toBe("system");

    for (const theme of ["light", "dark", "system"] as const) {
      localStorage.setItem("aer.theme", theme);
      expect(getTheme()).toBe(theme);
    }
  });

  it("resolves system from the device preference", () => {
    expect(resolveTheme("system")).toBe("light");
    systemIsDark = true;
    expect(resolveTheme("system")).toBe("dark");
  });

  it("applies and persists an explicit preference", () => {
    expect(applyTheme("dark")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(localStorage.getItem("aer.theme")).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("initializes system mode without replacing the implicit default", () => {
    systemIsDark = true;
    initTheme();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("aer.theme")).toBeNull();
  });

  it("reports device appearance changes and unsubscribes", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToSystemTheme(onChange);

    systemIsDark = true;
    systemChange?.();
    expect(onChange).toHaveBeenCalledWith("dark");

    unsubscribe();
    expect(systemChange).toBeUndefined();
  });
});
