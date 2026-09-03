import * as React from "react";
import {
  applyTheme,
  applyThemeToDocument,
  getTheme,
  resolveTheme,
  subscribeToSystemTheme,
  type ResolvedTheme,
  type Theme,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => getTheme());
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() =>
    resolveTheme(theme)
  );

  const setTheme = React.useCallback((t: Theme) => {
    setResolvedTheme(applyTheme(t));
    setThemeState(t);
  }, []);

  const toggle = React.useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  React.useEffect(() => {
    if (theme !== "system") return;
    return subscribeToSystemTheme((next) => {
      applyThemeToDocument(next);
      setResolvedTheme(next);
    });
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
