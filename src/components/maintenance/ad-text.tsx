import * as React from "react";
import type { AdBlock } from "@/types/api";
import { cn } from "@/lib/utils";

/**
 * An AD's text as the Federal Register meant it to be read (server: utils/adBlocks.ts):
 * numbered paragraphs indented to their depth, notes set apart, and tables as tables, where the
 * plain text had rows of dot leaders. `highlight` marks what matched the aircraft, standing
 * alone the way the matcher reads it ("IO-360", never the one inside "AEIO-360").
 */
export function AdText({ blocks, highlight, className }: { blocks: AdBlock[]; highlight?: string | null; className?: string }) {
  return (
    <div className={cn("space-y-2 text-[13px] leading-relaxed", className)}>
      {blocks.map((b, i) => {
        if (b.t === "h") return <p key={i} className="pt-1 font-medium text-foreground">{b.text}</p>;
        if (b.t === "note")
          return (
            <p key={i} className="border-l-2 border-border pl-3 text-muted-foreground">
              <Marked text={b.text} token={highlight} />
            </p>
          );
        if (b.t === "table") return <AdTable key={i} table={b} highlight={highlight} />;
        return (
          <p key={i} style={{ paddingLeft: `${Math.min(b.level, 3) * 1.25}rem` }}>
            <Marked text={b.text} token={highlight} />
          </p>
        );
      })}
    </div>
  );
}

function AdTable({ table, highlight }: { table: Extract<AdBlock, { t: "table" }>; highlight?: string | null }) {
  const width = Math.max(table.head.length, ...table.rows.map((r) => r.length));
  return (
    <figure className="space-y-1">
      {table.title && <figcaption className="text-[12px] font-medium text-muted-foreground">{table.title}</figcaption>}
      {/* Wide tables scroll inside themselves; the page never scrolls sideways. */}
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-[12px]">
          {table.head.length > 0 && (
            <thead className="bg-muted/50">
              <tr>
                {table.head.map((h, i) => (
                  <th key={i} className="border-b border-border px-2.5 py-1.5 text-left font-medium whitespace-nowrap text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 align-top">
                {Array.from({ length: width }, (_, j) => (
                  <td key={j} className="px-2.5 py-1.5">
                    <Marked text={r[j] ?? ""} token={highlight} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Marked({ text, token }: { text: string; token?: string | null }) {
  if (!token) return <>{text}</>;
  const body = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/-/g, "-\\s*");
  const parts = text.split(new RegExp(`((?<![A-Za-z0-9-])${body}(?![A-Za-z0-9]))`, "gi"));
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-primary/15 px-0.5 text-foreground">
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}
