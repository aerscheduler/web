import { cn } from "@/lib/utils";

/**
 * The two-tone mark. Filenames are historical and inverted from the surface
 * they belong on:
 *
 * - `/brand/logo-white.png` - blue arch + navy wing. Use on light backgrounds;
 *   the navy wing is what would vanish on a dark surface.
 * - `/brand/logo-blue.png` - blue arch + white wing. Use on dark backgrounds;
 *   the white wing is what vanishes on a white page.
 *
 * Default follows the console theme (`.dark` on `<html>`). Pass `onDark` on a
 * navy/black panel that does not follow the theme, or `onLight` on a surface
 * that is always white (the org-switcher tile).
 */
const LOGO_ON_LIGHT = "/brand/logo-white.png";
const LOGO_ON_DARK = "/brand/logo-blue.png";

export function LogoMark({
  className,
  onDark = false,
  onLight = false,
  alt = "AerScheduler",
}: {
  className?: string;
  onDark?: boolean;
  onLight?: boolean;
  alt?: string;
}) {
  const imgClass = cn("object-contain", className);
  if (onDark) {
    return (
      <img src={LOGO_ON_DARK} alt={alt} className={imgClass} draggable={false} />
    );
  }
  if (onLight) {
    return (
      <img src={LOGO_ON_LIGHT} alt={alt} className={imgClass} draggable={false} />
    );
  }
  return (
    <>
      <img
        src={LOGO_ON_LIGHT}
        alt={alt}
        className={cn(imgClass, "dark:hidden")}
        draggable={false}
      />
      <img
        src={LOGO_ON_DARK}
        alt=""
        aria-hidden
        className={cn(imgClass, "hidden dark:block")}
        draggable={false}
      />
    </>
  );
}

/** Mark + "AerScheduler" wordmark lockup. */
export function LogoLockup({
  className,
  onDark = false,
  subtitle,
}: {
  className?: string;
  onDark?: boolean;
  subtitle?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark onDark={onDark} className="size-8" />
      <div className="leading-tight">
        <div
          className={cn(
            "text-[15px] font-semibold tracking-tight",
            onDark ? "text-white" : "text-foreground"
          )}
        >
          AerScheduler
        </div>
        {subtitle && (
          <div
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.18em]",
              onDark ? "text-white/55" : "text-muted-foreground"
            )}
          >
            {subtitle}
          </div>
        )}
      </div>
    </div>
  );
}
