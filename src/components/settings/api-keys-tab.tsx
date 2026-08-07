import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  MoreHorizontal,
  Plus,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { pageRows, useApiKeysPage, useCreateApiKey, useRevokeApiKey } from "@/features/queries";
import { TablePagination } from "@/components/table-pagination";
import { usePaging } from "@/lib/paging";
import { API_KEY_ROLES, type ApiKey, type ApiKeyRole, type ApiKeyWithSecret } from "@/types/api";
import { ApiError } from "@/lib/api";
import { useConfirm } from "@/components/confirm-dialog";
import { EmptyState, ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

function errMessage(e: unknown, fallback: string) {
  if (e instanceof ApiError || e instanceof Error) return e.message || fallback;
  return fallback;
}

/** What each role lets a key do, in the terms someone picking one would use. */
const ROLE_HELP: Record<ApiKeyRole, string> = {
  admin: "Everything except deleting the organization. Only pick this if nothing narrower fits.",
  dispatcher: "Read and manage the schedule, close flights out, and read the fleet.",
  instructor: "Book and close out instruction; read the schedule and their students.",
  student: "Book their own lessons and read their own records.",
  renter: "Book rentals and read their own records.",
  //NOT grounding: that is `PATCH /resources/:id`, which is admin-only. A key issued on this
  //description would 403 on the one call the integration was written for.
  technician: "Squawks and maintenance reminders. Grounding an aircraft is an administrator action.",
};

const relative = (iso: string | null): string => {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

/**
 * API keys let a customer's own software talk to AerScheduler.
 *
 * This screen is the ONLY way to manage them: the server refuses /apiKeys to an
 * API key, even one holding the admin role, so a leaked key can never issue
 * itself replacements. Before this existed the documented answer was "curl it
 * with a session token", which is not a thing to ask a flight school to do.
 */
export function ApiKeysTab() {
  const paging = usePaging();
  const q = useApiKeysPage(paging);
  const revoke = useRevokeApiKey();
  const confirm = useConfirm();

  const [formOpen, setFormOpen] = React.useState(false);
  const [minted, setMinted] = React.useState<ApiKeyWithSecret | null>(null);

  const { rows: keys, total } = pageRows(q);
  const active = keys.filter((k) => k.status === "active");

  async function onRevoke(key: ApiKey) {
    const ok = await confirm({
      title: `Revoke "${key.name}"?`,
      description:
        "Anything using this key stops working on its very next request. This cannot be undone — you would have to create a new key and update whatever was using it.",
      confirmLabel: "Revoke key",
      destructive: true,
    });
    if (!ok) return;
    revoke.mutate(key.id, {
      onSuccess: () => toast.success(`"${key.name}" revoked.`),
      onError: (e) => toast.error(errMessage(e, "Couldn't revoke this key.")),
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <KeyRound className="size-4" />
          </span>
          <div>
            <CardTitle>API keys</CardTitle>
            <CardDescription>
              Let your own software read and write your schedule, fleet and billing. See the{" "}
              <a
                href="https://www.aerscheduler.com/docs/api"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                API documentation
              </a>
              .
            </CardDescription>
          </div>
        </div>
        <Button size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="size-4" /> Create key
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {q.isPending ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        ) : total === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet"
            body="Create one to connect your own tools — a booking page on your website, a report that runs itself, or an automation in Zapier."
            action={
              <Button size="sm" onClick={() => setFormOpen(true)}>
                <Plus className="size-4" /> Create key
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {keys.map((k) => (
              <KeyRow key={k.id} apiKey={k} onRevoke={onRevoke} />
            ))}
          </ul>
        )}
        <TablePagination
          paging={paging}
          total={total}
          returned={keys.length}
          loading={q.isFetching}
          className="px-1"
        />
      </CardContent>

      {active.length > 0 && (
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          A key acts with the roles you gave it, exactly as a person holding those roles
          would. Give each one the least it needs, and revoke any you no longer recognise.
        </div>
      )}

      <CreateKeyModal open={formOpen} onOpenChange={setFormOpen} onCreated={setMinted} />
      <SecretModal minted={minted} onClose={() => setMinted(null)} />
    </Card>
  );
}

function KeyRow({ apiKey, onRevoke }: { apiKey: ApiKey; onRevoke: (k: ApiKey) => void }) {
  const dead = apiKey.status !== "active";
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`truncate text-sm font-medium ${dead ? "text-muted-foreground line-through" : ""}`}>
            {apiKey.name}
          </span>
          {apiKey.status === "revoked" && <Badge variant="secondary">Revoked</Badge>}
          {apiKey.status === "expired" && <Badge variant="warning">Expired</Badge>}
          {apiKey.roles.map((r) => (
            <Badge key={r} variant="outline">
              {r}
            </Badge>
          ))}
        </div>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{apiKey.prefix}…</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {/* "Never used" is the useful signal here — it's how you spot a key
              that was created for something that never shipped. */}
          Last used {relative(apiKey.lastUsedAt)}
          {apiKey.createdBy?.user?.name && ` · created by ${apiKey.createdBy.user.name}`}
          {apiKey.expiresAt && ` · expires ${new Date(apiKey.expiresAt).toLocaleDateString()}`}
        </p>
      </div>
      {!dead && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${apiKey.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem variant="destructive" onSelect={() => void onRevoke(apiKey)}>
              <ShieldOff /> Revoke
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

function CreateKeyModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (key: ApiKeyWithSecret) => void;
}) {
  const create = useCreateApiKey();
  const [name, setName] = React.useState("");
  const [roles, setRoles] = React.useState<ApiKeyRole[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setName("");
      setRoles([]);
      setError(null);
    }
  }, [open]);

  const toggle = (role: ApiKeyRole) =>
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) return setError("Give the key a name so you can recognise it later.");
    if (roles.length === 0) return setError("Pick at least one role, or the key can't do anything.");

    create.mutate(
      { name: name.trim(), roles },
      {
        onSuccess: (key) => {
          // Close this first, then hand the secret up — the secret modal is the
          // only place it will ever be readable.
          onOpenChange(false);
          onCreated(key);
        },
        onError: (e) => setError(errMessage(e, "Couldn't create this key.")),
      }
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Create an API key"
      description="The key is shown once, when you create it. Store it somewhere safe before closing."
    >
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="ak-name">Name</Label>
          <Input
            id="ak-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Zapier sync"
            maxLength={80}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            What is this key for? You&rsquo;ll see this in the list.
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Roles</legend>
          <p className="text-xs text-muted-foreground">
            The key can do exactly what these roles allow. Give it the least it needs.
          </p>
          <div className="space-y-2 pt-1">
            {API_KEY_ROLES.map((role) => (
              <label key={role} className="flex cursor-pointer items-start gap-2.5">
                <Checkbox
                  checked={roles.includes(role)}
                  onCheckedChange={() => toggle(role)}
                  aria-describedby={`ak-role-${role}`}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium capitalize">{role}</span>
                  <span id={`ak-role-${role}`} className="block text-xs text-muted-foreground">
                    {ROLE_HELP[role]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create key"}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}

/**
 * The one and only time the secret is readable.
 *
 * Deliberately not dismissible by clicking outside: closing this is the moment
 * the secret becomes unrecoverable, so it should take a deliberate action.
 */
function SecretModal({
  minted,
  onClose,
}: {
  minted: ApiKeyWithSecret | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (minted) setCopied(false);
  }, [minted]);

  async function copy() {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.secret);
      setCopied(true);
      toast.success("Key copied to your clipboard.");
    } catch {
      // Clipboard can be blocked (insecure context, permissions). The secret is
      // on screen and selectable, so say so rather than failing silently.
      toast.error("Couldn't copy automatically — select the key and copy it manually.");
    }
  }

  return (
    <ResponsiveModal
      open={!!minted}
      onOpenChange={(open) => !open && onClose()}
      title="Your new API key"
      description="This is the only time we can show you this. We store only a hash of it."
    >
      {minted && (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-md border border-amber-300/60 bg-amber-50 p-3 text-amber-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p className="text-sm">
              Copy this now. Once you close this dialog it cannot be shown again — if you
              lose it you&rsquo;ll have to revoke this key and create another.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ak-secret">{minted.name}</Label>
            <div className="flex gap-2">
              <Input
                id="ak-secret"
                readOnly
                value={minted.secret}
                className="font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" variant="secondary" onClick={() => void copy()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
          </div>

          <div className="rounded-md bg-muted p-3">
            <p className="text-xs font-medium">Use it like this</p>
            <pre className="mt-1.5 overflow-x-auto text-xs text-muted-foreground">
              <code>{`curl https://api.aerscheduler.com/resources/planes \\
  -H "Authorization: Bearer ${minted.secret.slice(0, 14)}…"`}</code>
            </pre>
          </div>

          <div className="flex justify-end">
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
