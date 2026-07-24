import { cn, initials } from "@/lib/utils";

export function Avatar({
  name,
  src,
  className,
}: {
  name?: string | null;
  src?: string | null;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name ?? ""}
        className={cn("size-9 shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary",
        className
      )}
    >
      {initials(name)}
    </span>
  );
}
