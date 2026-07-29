import { useEffect, useState } from "react";

/**
 * useState that mirrors into localStorage so view preferences (grid/list, etc.)
 * survive reloads and navigation.
 */
export function usePersistedState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return defaultValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota / private mode — preference just won't persist.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
