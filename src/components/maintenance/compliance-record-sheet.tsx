import {
  CalendarClock,
  FileText,
  Gauge,
  Lock,
  Paperclip,
  PlaneTakeoff,
  ShieldCheck,
} from "lucide-react";
import type { MaintenanceComplianceRecord } from "@/types/api";
import { resourceLabel } from "@/types/api";
import { formatDate } from "@/lib/utils";
import { fromDeciHours, SOURCE_TYPE_LABELS, sourceLabel } from "@/lib/maintenance";
import { DetailPanel } from "@/components/detail-panel";
import { SheetDetailField, SheetDetailFields } from "@/components/sheet-detail-field";
import { Badge } from "@/components/ui/badge";

const STAMP = "MMM d, yyyy 'at' h:mm a";

/**
 * One signed-off inspection, in full.
 *
 * NO ACTIONS, deliberately, and this panel is the one place in the console where that is a
 * feature rather than an omission. Everything else here can be corrected; a compliance
 * record cannot, and offering an edit control that then failed would be worse than offering
 * none. The footer says so instead.
 */
export function ComplianceRecordSheet({
  record,
  loading = false,
  open,
  onOpenChange,
}: {
  record: MaintenanceComplianceRecord | null;
  /** A deep link to a record that is not on the current page has to fetch it first. */
  loading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const aircraft = record?.resource ? resourceLabel(record.resource).name : null;
  const ref = record ? sourceLabel(record) : null;

  return (
    <DetailPanel
      open={open}
      onOpenChange={onOpenChange}
      title={record?.templateName ?? "Compliance record"}
      description={aircraft ?? undefined}
      badge={
        record?.sourceType ? (
          <Badge variant="outline">{SOURCE_TYPE_LABELS[record.sourceType]}</Badge>
        ) : undefined
      }
      footer={
        record ? (
          <p className="flex w-full items-center gap-2 text-xs text-muted-foreground">
            <Lock className="size-3.5 shrink-0" />
            Signed {formatDate(record.createdAt, STAMP, "")}. Kept as written.
          </p>
        ) : undefined
      }
    >
      {!record && loading && (
        <div className="space-y-3 p-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}
      {!record && !loading && (
        <p className="p-1 text-sm text-muted-foreground">
          That record could not be loaded. It may belong to another school.
        </p>
      )}
      {record && (
        <div data-doc-shot="compliance-record-panel" className="space-y-5 pt-4">
          <SheetDetailFields>
            {/* What was actually done. First, because it is the sentence an inspector reads
                and everything else on this panel is context for it. */}
            <SheetDetailField icon={FileText} label="Method of compliance" stacked>
              <p className="whitespace-pre-wrap">{record.methodOfCompliance}</p>
            </SheetDetailField>

            {ref && (
              <SheetDetailField icon={ShieldCheck} label="Rule complied with" stacked>
                {/* As it stood at signature. The template may have been superseded since,
                    and this record deliberately does not follow it. */}
                <span className="font-medium">{ref}</span>
              </SheetDetailField>
            )}

            {aircraft && (
              <SheetDetailField icon={PlaneTakeoff} label="Aircraft">
                <span className="font-mono">{aircraft}</span>
              </SheetDetailField>
            )}

            <SheetDetailField icon={CalendarClock} label="Complied">
              <span className="tabular-nums">{formatDate(record.complianceDate, "MMM d, yyyy", "")}</span>
            </SheetDetailField>

            {(record.tachAtCompliance != null || record.hobbsAtCompliance != null) && (
              <SheetDetailField icon={Gauge} label="Meter readings at compliance" stacked>
                <span className="tabular-nums">
                  {record.tachAtCompliance != null && `${fromDeciHours(record.tachAtCompliance)} tach`}
                  {record.tachAtCompliance != null && record.hobbsAtCompliance != null && " · "}
                  {record.hobbsAtCompliance != null && `${fromDeciHours(record.hobbsAtCompliance)} hobbs`}
                </span>
              </SheetDetailField>
            )}

            <SheetDetailField icon={ShieldCheck} label="Certified by">
              <div>
                <div className="font-medium">{record.mechanicName}</div>
                {record.mechanicCertificateNumber && (
                  <div className="font-mono text-xs text-muted-foreground">
                    {record.mechanicCertificateType ? `${record.mechanicCertificateType} ` : ""}
                    {record.mechanicCertificateNumber}
                  </div>
                )}
              </div>
            </SheetDetailField>

            {record.fileUrls.length > 0 && (
              <SheetDetailField icon={Paperclip} label="Attached">
                <ul className="space-y-1">
                  {record.fileUrls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm underline-offset-2 hover:underline"
                      >
                        {url.split("/").pop() || "Attachment"}
                      </a>
                    </li>
                  ))}
                </ul>
              </SheetDetailField>
            )}
          </SheetDetailFields>
        </div>
      )}
    </DetailPanel>
  );
}
