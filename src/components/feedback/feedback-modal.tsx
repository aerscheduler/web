import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import { useSubmitFeedback } from "@/features/queries";

const MAX_MESSAGE_LENGTH = 10_000;

export function FeedbackModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const submitFeedback = useSubmitFeedback();
  const [message, setMessage] = useState("");

  function reset() {
    setMessage("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Please enter a message before sending.");
      return;
    }
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      toast.error(`Please keep your message under ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`);
      return;
    }

    try {
      await submitFeedback.mutateAsync(trimmed);
      toast.success("Thanks — your feedback was sent.");
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't send your feedback. Please try again.");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Send feedback"
      description="Tell us what's working well, what isn't, or report a problem. We read every message."
      className="sm:max-w-md"
    >
      <div className="space-y-4 pt-2">
        <div className="space-y-2">
          <Label htmlFor="feedback-message">Message</Label>
          <Textarea
            id="feedback-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what you ran into or what you'd like to see improved…"
            rows={6}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={submitFeedback.isPending}
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitFeedback.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={submitFeedback.isPending}>
            {submitFeedback.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
