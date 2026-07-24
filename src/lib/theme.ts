export type Theme = "light" | "dark";
const KEY = "aer.theme";

export function getTheme(): Theme {
  const stored = localStorage.getItem(KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle("dark", t === "dark");
  localStorage.setItem(KEY, t);
}

export function initTheme() {
  document.documentElement.classList.toggle("dark", getTheme() === "dark");
}
