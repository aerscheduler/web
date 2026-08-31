import { useState } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { useAddSquawkComment } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { formatDate, initials } from "@/lib/utils";
import type { SquawkComment } from "@/types/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const STAMP = "MMM d, yyyy 'at' h:mm a";

/** Matches the server's own limit, so the count runs out at the same place the write fails. */
const MAX = 2000;

/**
 * The running thread on a squawk.
 *
 * WHY THIS EXISTS. Until this landed, the only way to write anything against a squawk was
 * to resolve it: `notes` is a single column written by the resolve form and overwritten by
 * the next sign-off. So "ordered the part, it is a week out" had nowhere to go, and the
 * choice was to close a defect that was not fixed or to say nothing at all.
 *
 * Append-only, matching the server. No edit, no delete, for anyone. A note about work on an
 * aircraft is the account of what was done to it, and an account that can be quietly
 * changed afterwards is worth less than none. A mistake is corrected by adding another note.
 *
 * Reading is wider than writing on purpose: a pilot can see the defects on an aircraft they
 * are about to fly, but the thread is the maintenance account of it, so only the people who
 * can verify or resolve one may add to it.
 */
export function SquawkNotes({
  squawkId,
  comments,
  canWrite,
  loading = false,
  compact = false,
}: {
  squawkId: number;
  comments: SquawkComment[] | undefined;
  /** Admin or technician, the same gate as verify and resolve. */
  canWrite: boolean;
  /** The thread is still being fetched, so an empty state would be a lie. */
  loading?: boolean;
  /** Tighter type and spacing, for the docked panel rather than the record page. */
  compact?: boolean;
}) {
  const [body, setBody] = useState("");
  const add = useAddSquawkComment();
  const trimmed = body.trim();
  const list = comments ?? [];

  async function submit() {
    if (!trimmed || add.isPending) return;
    try {
      await add.mutateAsync({ id: squawkId, body: trimmed });
      //Cleared only after the server has it. A failed write that empties the box loses
      //what somebody just typed, which is the one thing a composer must never do.
      setBody("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't add that note.");
    }
  }

  return (
    <div className="space-y-3">
      {list.length > 0 ? (
        <ol className="space-y-3">
          {list.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span
                className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground"
                aria-hidden
              >
                {initials(c.author?.user?.name) || "?"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium">
                    {c.author?.user?.name ?? "Removed member"}
                  </span>
                  <span className="text-[11px] tabular-nums text-muted-foreground">
                    {formatDate(c.createdAt, STAMP, "")}
                  </span>
                </div>
                <p
                  className={
                    compact
                      ? "whitespace-pre-wrap text-[12px] text-muted-foreground"
                      : "whitespace-pre-wrap text-[13px]"
                  }
                >
                  {c.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      ) : loading ? (
        <p className="text-[13px] text-muted-foreground">Loading notes...</p>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <MessageSquare className="size-4 shrink-0" />
          {canWrite
            ? "No notes yet. Add one to record what is happening without closing the squawk."
            : "No notes yet."}
        </p>
      )}

      {canWrite && (
        <div className="space-y-2">
          <Textarea
            value={body}
            maxLength={MAX}
            rows={compact ? 2 : 3}
            placeholder="Part ordered, waiting on a hangar slot, ran it again and it did not repeat..."
            onChange={(e) => setBody(e.target.value)}
            //Enter is a newline, because these run to several lines. Cmd/Ctrl-Enter posts.
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-muted-foreground">
              {trimmed.length > MAX - 200 ? `${trimmed.length} of ${MAX}` : "Notes cannot be edited or deleted."}
            </span>
            <Button size="sm" disabled={!trimmed || add.isPending} onClick={() => void submit()}>
              {add.isPending ? "Adding..." : "Add note"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
