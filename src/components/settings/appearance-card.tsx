import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import type { Theme } from "@/lib/theme";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Light / Dark segmented picker, matching what the app persists per device. */
export function AppearanceControl() {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex rounded-md border bg-muted/50 p-0.5"
    >
      {OPTIONS.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[4px] px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <o.icon className="size-3.5" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Drop-in Appearance card for Settings / Profile. */
export function AppearanceCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Choose how the console looks on this device.</CardDescription>
      </CardHeader>
      <CardContent>
        <AppearanceControl />
      </CardContent>
    </Card>
  );
}
