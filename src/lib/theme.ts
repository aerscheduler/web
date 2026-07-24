export type Theme = "light" | "dark";

// Dark mode is disabled for now — the console is light-only. These keep the same
// signatures so the ThemeProvider/useTheme callers still compile, but they always
// resolve to light and never add the `.dark` class.
export function getTheme(): Theme {
  return "light";
}

export function applyTheme(_t: Theme) {
  document.documentElement.classList.remove("dark");
}

export function initTheme() {
  document.documentElement.classList.remove("dark");
}
