import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateAnnouncement,
  useUpdateAnnouncement,
} from "@/features/queries";
import type { Announcement } from "@/types/api";
import { ApiError } from "@/lib/api";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Create or edit a school announcement.
 *
 * Same fields the iPhone Create / Edit sheets take: title (60), message (600),
 * optional expiry. Targeting by role exists on the API; the app does not set it
 * on create, and neither does this dialog, so a post reaches the whole school.
 */
export function AnnouncementFormDialog({
  open,
  onOpenChange,
  announcement,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the dialog edits that row instead of posting a new one. */
  announcement?: Announcement | null;
}) {
  const create = useCreateAnnouncement();
  const update = useUpdateAnnouncement();
  const editing = announcement != null;

  const [title, setTitle] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [expireAt, setExpireAt] = React.useState<Date | undefined>(undefined);
  const [expirePickerOpen, setExpirePickerOpen] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(announcement?.title ?? "");
    setMessage(announcement?.message ?? "");
    setExpireAt(announcement?.expireAt ? new Date(announcement.expireAt) : undefined);
    setShowErrors(false);
  }, [open, announcement]);

  const titleTrim = title.trim();
  const titleError =
    titleTrim.length === 0
      ? "Title is required"
      : titleTrim.length > 60
        ? "Title must be 60 characters or fewer"
        : null;
  const messageError =
    message.trim().length > 600 ? "Message must be 600 characters or fewer" : null;
  const busy = create.isPending || update.isPending;

  async function submit() {
    if (busy) return;
    if (titleError || messageError) {
      setShowErrors(true);
      document.getElementById("announcement-title")?.focus();
      return;
    }
    const body = {
      title: titleTrim,
      message: message.trim(),
      expireAt: expireAt ? expireAt.toISOString() : null,
    };
    try {
      if (editing) {
        await update.mutateAsync({ id: announcement.id, ...body });
        toast.success("Announcement updated");
      } else {
        await create.mutateAsync(body);
        toast.success("Announcement posted");
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof ApiError
          ? e.message
          : editing
            ? "Couldn't update the announcement"
            : "Couldn't post the announcement"
      );
    }
  }

  return (
    <ResponsiveModal
      footer={
        <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={busy}>
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Saving…
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                "Post announcement"
              )}
            </Button>
        </div>
      }
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Edit announcement" : "New announcement"}
      description={
        editing
          ? "Change the notice everyone sees on the board."
          : "Post a notice to the school. Members are notified by email and push, if they have those on."
      }
      className="sm:max-w-lg"
    >
      <div className="space-y-4" data-doc-shot="announcement-form-dialog">
        <div className="space-y-1.5">
          <Label htmlFor="announcement-title">Title</Label>
          <Input
            id="announcement-title"
            value={title}
            maxLength={60}
            placeholder="Runway 4L closed for resurfacing"
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={showErrors && !!titleError}
          />
          <div className="flex justify-between gap-2">
            {showErrors && titleError ? (
              <p className="text-xs text-destructive">{titleError}</p>
            ) : (
              <span />
            )}
            <p className="text-xs text-muted-foreground tnum">{title.length}/60</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="announcement-message">Message</Label>
          <Textarea
            id="announcement-message"
            value={message}
            maxLength={600}
            rows={6}
            placeholder="What everyone needs to know, and by when"
            onChange={(e) => setMessage(e.target.value)}
            aria-invalid={showErrors && !!messageError}
          />
          <div className="flex justify-between gap-2">
            {showErrors && messageError ? (
              <p className="text-xs text-destructive">{messageError}</p>
            ) : (
              <span />
            )}
            <p className="text-xs text-muted-foreground tnum">{message.length}/600</p>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Expires</Label>
          <Popover open={expirePickerOpen} onOpenChange={setExpirePickerOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start gap-2 font-normal",
                  !expireAt && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="size-4 shrink-0 opacity-70" />
                {expireAt ? format(expireAt, "MMM d, yyyy") : "Never"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={expireAt}
                onSelect={(d) => {
                  setExpireAt(d);
                  setExpirePickerOpen(false);
                }}
                autoFocus
              />
              {expireAt && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setExpireAt(undefined);
                      setExpirePickerOpen(false);
                    }}
                  >
                    Never expires
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <p className="text-xs text-muted-foreground">
            Expired notices drop off the live board. Leave blank to keep it until you delete it.
          </p>
        </div>

      </div>
    </ResponsiveModal>
  );
}
