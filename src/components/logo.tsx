import { cn } from "@/lib/utils";

/**
 * The AerScheduler mark (from the production app assets). Use `onDark` on navy /
 * dark surfaces (renders the white mark); otherwise the brand-blue mark is used.
 */
export function LogoMark({
  className,
  onDark = false,
  alt = "AerScheduler",
}: {
  className?: string;
  onDark?: boolean;
  alt?: string;
}) {
  return (
    <img
      src={onDark ? "/brand/logo-white.png" : "/brand/logo-blue.png"}
      alt={alt}
      className={cn("object-contain", className)}
      draggable={false}
    />
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
