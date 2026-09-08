import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip } from "lucide-react";
import type { MaintenanceReminder } from "@/types/api";
import {
  useAddReminderFiles,
  useMaintenanceReminder,
  useRemoveReminderFile,
} from "@/features/queries";
import { DocsHint } from "@/components/docs-hint";
import { SquawkAttachments, attachmentName } from "@/components/maintenance/squawk-attachments";
import { SquawkFileInput } from "@/components/maintenance/squawk-file-input";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";

function fileLabel(url: string) {
  return attachmentName(url);
}

/**
 * Working files on an OPEN inspection. Copied onto the signed record, then cleared.
 */
export function ReminderFilesSheet({
  reminder,
  open,
  onOpenChange,
}: {
  reminder: MaintenanceReminder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = reminder?.id ?? null;
  const q = useMaintenanceReminder(open ? id : null);
  const add = useAddReminderFiles();
  const remove = useRemoveReminderFile();
  const [files, setFiles] = useState<File[]>([]);
  const [fileBusy, setFileBusy] = useState(false);
  const lastRef = useRef(reminder);
  if (reminder) lastRef.current = reminder;
  const shown = reminder ?? lastRef.current;

  const urls = q.data?.fileUrls ?? shown?.fileUrls ?? [];
  const remaining = Math.max(0, 5 - urls.length);
  const name = shown?.due?.name ?? shown?.template?.name ?? "Inspection";

  async function saveNew() {
    if (!id || files.length === 0) return;
    try {
      const result = await add.mutateAsync({ id, files });
      if (result.uploadError) {
        toast.error(`Saved, but ${result.uploadError} Remove it and try again.`);
      } else {
        toast.success("File added.");
      }
      setFiles([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not attach that file.");
    }
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(o) => {
        if (!o) setFiles([]);
        onOpenChange(o);
      }}
      title="Inspection files"
      description={`${name}. These copy onto a compliance record if you keep one. You can take one down until you sign off.`}
      footer={
        remaining > 0 ? (
          <Button
            onClick={() => void saveNew()}
            disabled={files.length === 0 || add.isPending || fileBusy}
          >
            {add.isPending ? "Saving…" : "Save files"}
          </Button>
        ) : undefined
      }
    >
      <div className="mb-3">
        <DocsHint topic="inspection-files" />
      </div>
      {urls.length > 0 && (
        <div className="mb-3">
          <SquawkAttachments
            fileUrls={urls}
            onRemove={
              remove.isPending
                ? undefined
                : (url) => {
                    if (!id) return;
                    void remove.mutateAsync({ id, fileName: fileLabel(url) }).catch((e) => {
                      toast.error(e instanceof Error ? e.message : "Could not remove that file.");
                    });
                  }
            }
          />
        </div>
      )}
      {remaining > 0 ? (
        <SquawkFileInput
          files={files}
          onChange={setFiles}
          hint={false}
          max={remaining}
          onBusyChange={setFileBusy}
          helpText={`Up to ${remaining} more photo${remaining === 1 ? "" : "s"} or PDFs. They copy onto a compliance record if you keep one when you sign off.`}
        />
      ) : (
        <p className="text-[12px] text-muted-foreground">This inspection already has 5 files. Remove one to add another.</p>
      )}
    </ResponsiveModal>
  );
}

export function ReminderFilesButton({
  reminder,
  onClick,
}: {
  reminder: MaintenanceReminder;
  onClick: () => void;
}) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label="Inspection files">
      <Paperclip className="size-3.5" />
      Files
      {reminder.hasAttachments ? <span className="sr-only"> (has files)</span> : null}
    </Button>
  );
}
