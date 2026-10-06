import { Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WhatsNewBlock, WhatsNewImage } from "@/types/whats-new";
import { whatsNewIcon } from "./whats-new-icons";

/**
 * A picture in both themes. The console's dark mode is a class on <html>, so both images are in
 * the page and CSS shows one; no flash when the theme changes.
 */
export function ThemedImage({ image, className }: { image: WhatsNewImage; className?: string }) {
  return (
    <>
      <img src={image.light} alt={image.alt} className={cn(image.dark && "dark:hidden", className)} draggable={false} />
      {image.dark && <img src={image.dark} alt={image.alt} className={cn("hidden dark:block", className)} draggable={false} />}
    </>
  );
}

/** Every block type, drawn one way. The app draws the same blocks in whats_new_blocks.dart. */
export function WhatsNewBlocks({ blocks }: { blocks: WhatsNewBlock[] }) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "lede":
            return (
              <p key={i} className="mt-3 text-[15px] leading-relaxed text-foreground/85">
                {block.text}
              </p>
            );
          case "features":
            return (
              <div key={i} className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2">
                {block.items.map((f) => {
                  const Icon = whatsNewIcon(f.icon);
                  return (
                    <div key={f.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                      <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" />
                      </span>
                      <div>
                        <div className="text-sm font-semibold leading-snug">{f.title}</div>
                        <div className="mt-0.5 text-[13px] leading-normal text-muted-foreground">{f.body}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          case "screenshot":
            return (
              <figure key={i} className="mt-7">
                <div className="overflow-hidden rounded-lg border bg-muted">
                  <ThemedImage image={block.image} className="block w-full" />
                </div>
                {block.caption && <figcaption className="mt-2 text-xs text-muted-foreground">{block.caption}</figcaption>}
              </figure>
            );
          case "steps":
            return (
              <div key={i} className="mt-7">
                {block.title && <div className="mb-2.5 text-sm font-semibold">{block.title}</div>}
                <ol className="grid gap-2.5">
                  {block.items.map((s, n) => (
                    <li key={n} className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5 text-sm text-foreground/85">
                      <span className="grid size-[22px] place-items-center rounded-full border text-xs font-semibold text-muted-foreground tabular-nums">
                        {n + 1}
                      </span>
                      <span className="pt-px">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          case "note":
            return (
              <div key={i} className="mt-6 grid grid-cols-[16px_minmax(0,1fr)] gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-normal text-muted-foreground">
                <Info className="mt-0.5 size-4" />
                <p>{block.text}</p>
              </div>
            );
          case "section":
            return (
              <div key={i} className="mt-7">
                <h3 className="text-[15px] font-semibold leading-snug">{block.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">{block.body}</p>
              </div>
            );
          case "list":
            return (
              <ul key={i} className="mt-6 grid gap-2.5">
                {block.items.map((item, n) => (
                  <li key={n} className="grid grid-cols-[20px_minmax(0,1fr)] items-start gap-2.5 text-sm leading-relaxed text-foreground/85">
                    <span className="mt-0.5 grid size-5 place-items-center rounded-full bg-primary/10 text-primary">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            );
          default:
            // A block type this console does not know yet: leave it out rather than break the page.
            return null;
        }
      })}
    </>
  );
}
