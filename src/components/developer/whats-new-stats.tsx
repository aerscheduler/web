import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWhatsNewPeople, useWhatsNewStats } from "@/features/whats-new";
import { whatsNewWindow } from "@/components/whats-new/whats-new-store";
import type { WhatsNewStat } from "@/types/whats-new";

const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const when = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const STATUS: Record<WhatsNewStat["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-warning/15 text-warning" },
  scheduled: { label: "Scheduled", className: "bg-muted text-muted-foreground" },
  live: { label: "Live", className: "bg-success/15 text-success" },
  listed: { label: "In the list", className: "bg-muted text-muted-foreground" },
};

const pct = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "");

/**
 * Every "What's new" update with who saw, opened and clicked it, from our own receipts table
 * (exact; demo orgs left out). Preview opens the real window on any update, drafts and other
 * roles' updates included, without recording anything.
 */
export function WhatsNewStatsPanel() {
  const stats = useWhatsNewStats();
  const [selected, setSelected] = useState<string | null>(null);
  const people = useWhatsNewPeople(selected);
  const rows = stats.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-[68ch] text-sm text-muted-foreground">
        Updates are files in <code className="text-xs">server/src/whatsNew/entries</code>. A draft shows only to developers;
        set <code className="text-xs">draft: false</code> and deploy the API to publish it. Ask Claude to write one with the
        write-whats-new skill.
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full min-w-[760px] text-sm tabular-nums">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Update</th>
              <th className="px-3 py-2.5 text-right font-medium">Audience</th>
              <th className="px-3 py-2.5 text-right font-medium">Saw it</th>
              <th className="px-3 py-2.5 text-right font-medium">Opened</th>
              <th className="px-3 py-2.5 text-right font-medium">Clicked through</th>
              <th className="px-3 py-2.5 text-right font-medium">Dismissed unread</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {stats.isLoading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.entry.id}
                onClick={() => setSelected(r.entry.id === selected ? null : r.entry.id)}
                className={cn("cursor-pointer border-b last:border-0 hover:bg-muted/50", r.entry.id === selected && "bg-muted/60")}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.entry.title}</span>
                    <span className={cn("rounded px-1.5 py-px text-[11px] font-semibold", STATUS[r.status].className)}>
                      {STATUS[r.status].label}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {day.format(new Date(r.entry.publishedAt))} · {r.entry.audienceLabel}
                    {r.audience.platforms && r.audience.platforms.length < 2 ? ` · ${r.audience.platforms[0]} only` : ""}
                  </div>
                </td>
                <td className="px-3 py-3 text-right">{r.audienceSize}</td>
                <td className="px-3 py-3 text-right">
                  {r.shown} <span className="text-xs text-muted-foreground">{pct(r.shown, r.audienceSize)}</span>
                </td>
                <td className="px-3 py-3 text-right">
                  {r.opened} <span className="text-xs text-muted-foreground">{pct(r.opened, r.shown)}</span>
                </td>
                <td className="px-3 py-3 text-right" title={`${r.action} in-product, ${r.link} to the public page`}>
                  {r.action + r.link}
                </td>
                <td className="px-3 py-3 text-right">{r.dismissed}</td>
                <td className="px-3 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      whatsNewWindow.open(r.entry.id, "console_menu", rows.map((x) => x.entry));
                    }}
                  >
                    <Eye className="size-3.5" />
                    Preview
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <div className="border-b px-4 py-2.5 text-sm font-semibold">
            People · {rows.find((r) => r.entry.id === selected)?.entry.title}
          </div>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Person</th>
                <th className="px-3 py-2 text-left font-medium">Organization</th>
                <th className="px-3 py-2 text-left font-medium">Roles</th>
                <th className="px-3 py-2 text-left font-medium">Saw it</th>
                <th className="px-3 py-2 text-left font-medium">Opened</th>
                <th className="px-3 py-2 text-left font-medium">Clicked</th>
                <th className="px-3 py-2 text-left font-medium">Dismissed</th>
              </tr>
            </thead>
            <tbody>
              {(people.data ?? []).map((p) => (
                <tr key={p.user.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{p.user.name}</div>
                    <div className="text-xs text-muted-foreground">{p.user.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {p.organization?.name ?? "-"}
                    {p.organization?.isDemo && <span className="ml-1 text-xs text-muted-foreground">(demo)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{p.roles.join(", ")}</td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{p.shownAt ? when.format(new Date(p.shownAt)) : ""}</td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{p.openedAt ? when.format(new Date(p.openedAt)) : ""}</td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">
                    {[p.actionClickedAt && "In product", p.linkClickedAt && "Public page"].filter(Boolean).join(", ")}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground tabular-nums">{p.dismissedAt ? when.format(new Date(p.dismissedAt)) : ""}</td>
                </tr>
              ))}
              {people.data && people.data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-muted-foreground">
                    Nobody has seen this one yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
