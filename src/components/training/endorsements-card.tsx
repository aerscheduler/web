import { useState } from "react";
import { AlertTriangle, FileSignature, Plus, ScrollText } from "lucide-react";
import type { Endorsement, EndorsementTemplate } from "@/types/api";
import {
  useCreateEndorsement,
  useEndorsementTemplates,
  useEndorsements,
} from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { DocsHint } from "@/components/docs-hint";
import { Badge } from "@/components/ui/badge";
import { ResponsiveModal } from "@/components/responsive-modal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const GROUP_LABEL: Record<EndorsementTemplate["group"], string> = {
  presolo: "Before solo",
  solo: "Solo",
  crossCountry: "Cross-country",
  test: "Knowledge & practical tests",
  privileges: "Additional privileges & reviews",
};

/** Expired, expiring, or fine, the only three states that change what anyone does. */
function expiryState(e: Endorsement): { label: string; tone: "danger" | "warning" | null } {
  if (!e.expiresAt) return { label: "", tone: null };
  const days = Math.floor((new Date(e.expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Expired ${formatDate(e.expiresAt, "MMM d")}`, tone: "danger" };
  if (days <= 14) return { label: `Expires in ${days}d`, tone: "warning" };
  return { label: `Expires ${formatDate(e.expiresAt, "MMM d, yyyy")}`, tone: null };
}

/**
 * A pilot's endorsements.
 *
 * The 90-day solo is the reason this needs to be glanceable rather than a list: it lapses
 * silently, and a student turning up for a solo with an expired one is a flight that should
 * not leave. So expiry is stated on the row, and an expired endorsement is loud.
 */
export function EndorsementsCard({
  orgUserId,
  isSelf,
  enrollmentId,
}: {
  orgUserId: number;
  isSelf: boolean;
  enrollmentId?: number;
}) {
  const { isAdmin, roles } = useAuth();
  //`POST /training/endorsements` is `canGrade`: an admin or an instructor, and nobody else.
  //This asked `isStaff`, which includes dispatchers, so the front desk was offered a "Sign
  //one" button that 403s. An endorsement is a signature under somebody's certificate
  //number, which is exactly the thing a dispatcher must not be invited to give.
  const canSign = isAdmin || roles.includes("instructor");
  const [open, setOpen] = useState(false);
  const [replacing, setReplacing] = useState<Endorsement | null>(null);

  const q = useEndorsements(isSelf ? undefined : { orgUserId });
  const rows = q.data ?? [];

  if (q.isPending) return null;
  //Nothing signed and nobody here who could sign one: a card that can only ever say "none"
  //is noise on a page that already has plenty.
  if (q.isError || (rows.length === 0 && !canSign)) return null;

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-medium">Endorsements</h2>
        </div>
        {canSign ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setReplacing(null);
              setOpen(true);
            }}
          >
            <Plus className="size-4" /> Sign one
          </Button>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing signed yet. Pre-solo, solo and cross-country endorsements appear here.
        </p>
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => {
            const expiry = expiryState(e);
            return (
              <li key={e.id} className="rounded-md border p-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 text-sm font-medium">{e.title}</span>
                  {expiry.tone === "danger" ? (
                    <Badge variant="danger" className="gap-1">
                      <AlertTriangle className="size-3" /> {expiry.label}
                    </Badge>
                  ) : expiry.tone === "warning" ? (
                    <Badge variant="warning">{expiry.label}</Badge>
                  ) : expiry.label ? (
                    <Badge variant="outline">{expiry.label}</Badge>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                  {e.renderedText}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span>
                    {e.signedBy?.user?.name ?? "Instructor"} · {formatDate(e.signedAt, "MMM d, yyyy")}
                  </span>
                  {e.signerCertificateNumber ? <span>· CFI {e.signerCertificateNumber}</span> : null}
                  {e.templateCode && e.templateCode !== "custom" ? (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      AC 61-65K {e.templateCode}
                    </Badge>
                  ) : null}
                  {canSign && e.expiresAt ? (
                    <>
                      <span className="flex-1" />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => {
                          setReplacing(e);
                          setOpen(true);
                        }}
                      >
                        Renew
                      </Button>
                    </>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SignDialog
        open={open}
        onOpenChange={setOpen}
        orgUserId={orgUserId}
        enrollmentId={enrollmentId}
        replacing={replacing}
      />
    </Card>
  );
}

function SignDialog({
  open,
  onOpenChange,
  orgUserId,
  enrollmentId,
  replacing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orgUserId: number;
  enrollmentId?: number;
  replacing: Endorsement | null;
}) {
  const templates = useEndorsementTemplates(orgUserId, { enabled: open });
  const create = useCreateEndorsement();

  const [code, setCode] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [cert, setCert] = useState("");
  const [seeded, setSeeded] = useState(false);

  const list = templates.data ?? [];
  const chosen = list.find((t) => t.code === code) ?? null;

  //Renewing pre-selects the template that was signed before, because the overwhelmingly
  //common case is the same 90-day solo again.
  if (open && !seeded && list.length) {
    setSeeded(true);
    const preset = replacing?.templateCode ? list.find((t) => t.code === replacing.templateCode) : null;
    if (preset) {
      setCode(preset.code);
      setTitle(preset.title);
      setText(preset.body);
    }
  }
  if (!open && seeded) {
    setSeeded(false);
    setCode(null);
    setTitle("");
    setText("");
  }

  const grouped = list.reduce<Record<string, EndorsementTemplate[]>>((acc, t) => {
    (acc[t.group] ??= []).push(t);
    return acc;
  }, {});

  //The AC leaves blanks a human has to fill; flag them rather than let one get signed.
  const blanks = (text.match(/\{[^}]+\}/g) ?? []).length;

  return (
    <ResponsiveModal
      open={open} onOpenChange={onOpenChange}
      title={replacing ? "Renew endorsement" : "Sign an endorsement"}
      description={<>{/* Said here because it is the one thing about this screen that is not obvious:
                what you save is what stands, forever, even after the AC is revised. */}
            The text you save is stored exactly as written and never regenerated, it has to keep
            saying what you signed today.</>}
      size="xl"
      footer={code ? (<><Button
              disabled={create.isPending || text.trim().length < 10}
              onClick={async () => {
                await create.mutateAsync({
                  orgUserId,
                  templateCode: code,
                  title: title.trim() || chosen?.title || "Endorsement",
                  renderedText: text.trim(),
                  enrollmentId: enrollmentId ?? null,
                  signerCertificateNumber: cert.trim() || null,
                  supersedesId: replacing?.id ?? null,
                });
                onOpenChange(false);
              }}
            >
              <FileSignature className="size-4" /> Sign
            </Button></>) : null}
      data-doc-shot="endorsements-card-sign"
    >

        

        {!code ? (
          <div className="space-y-3">
            {Object.entries(grouped).map(([group, items]) => (
              <div key={group}>
                <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">
                  {GROUP_LABEL[group as EndorsementTemplate["group"]] ?? group}
                </div>
                <div className="space-y-1">
                  {items.map((t) => (
                    <button
                      key={t.code}
                      type="button"
                      onClick={() => {
                        setCode(t.code);
                        setTitle(t.title);
                        setText(t.body);
                      }}
                      className="w-full rounded-md border px-3 py-2 text-left text-sm transition hover:bg-accent"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{t.title}</span>
                        <span className="text-xs text-muted-foreground">{t.regulation}</span>
                      </div>
                      {t.expiresInDays ? (
                        <span className="text-xs text-amber-600">
                          Expires after {t.expiresInDays} days
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCode(null)}>
                ← Pick a different one
              </Button>
              {chosen?.expiresInDays ? (
                <Badge variant="outline">Expires after {chosen.expiresInDays} days</Badge>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="end-title">Title</Label>
              <Input id="end-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="end-text">Endorsement</Label>
                <DocsHint topic="endorsement-blanks" />
              </div>
              <Textarea
                id="end-text"
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="font-mono text-xs"
              />
              {blanks > 0 ? (
                <p className="flex items-start gap-1.5 text-xs text-amber-600">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  {blanks} blank{blanks === 1 ? "" : "s"} still to fill in, anything in {"{braces}"} is
                  yours to complete.
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <Label htmlFor="end-cert">Your certificate number</Label>
              <Input
                id="end-cert"
                value={cert}
                onChange={(e) => setCert(e.target.value)}
                placeholder="§61.51(h) wants this on the entry"
              />
            </div>
          </div>
        )}

        {create.error ? <p className="text-sm text-destructive">{(create.error as Error).message}</p> : null}

    </ResponsiveModal>
  );
}
