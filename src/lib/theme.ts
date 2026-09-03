export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = Exclude<Theme, "system">;

const KEY = "aer.theme";
const SYSTEM_DARK_QUERY = "(prefers-color-scheme: dark)";

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return "system";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia(SYSTEM_DARK_QUERY).matches ? "dark" : "light";
}

export function applyThemeToDocument(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = applyThemeToDocument(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // The selected theme still applies for this page even when it cannot persist.
  }
  return resolved;
}

export function initTheme() {
  applyThemeToDocument(getTheme());
}

export function subscribeToSystemTheme(onChange: (theme: ResolvedTheme) => void): () => void {
  const query = window.matchMedia(SYSTEM_DARK_QUERY);
  const handleChange = () => onChange(query.matches ? "dark" : "light");
  query.addEventListener("change", handleChange);
  return () => query.removeEventListener("change", handleChange);
}
